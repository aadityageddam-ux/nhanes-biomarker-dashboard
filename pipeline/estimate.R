# Run from the repository root after python pipeline/fetch_sources.py.
if (dir.exists('pipeline/library')) .libPaths(c('pipeline/library', .libPaths()))
library(survey)
library(foreign)
library(jsonlite)
options(survey.lonely.psu='fail')
manifest <- fromJSON('data/sources.json')
stopifnot(nrow(manifest)==208, all(c('year','file','md5','sha256') %in% names(manifest)))
paths <- sprintf('pipeline/cache/%s/%s',manifest$year,manifest$file)
stopifnot(all(file.exists(paths)), all(unname(tools::md5sum(paths))==manifest$md5))

age_labels <- c('20-29','30-39','40-49','50-59','60-69','70-79','80+')
markers <- list(
  total_cholesterol=c('Total cholesterol','mg/dL'),
  hdl=c('HDL cholesterol','mg/dL'), ldl=c('Calculated LDL cholesterol','mg/dL'),
  triglycerides=c('Triglycerides','mg/dL'), glucose=c('Fasting glucose','mg/dL'),
  hba1c=c('HbA1c','%'), crp=c('C-reactive protein','mg/L'),
  wbc=c('White blood cells','10^3/uL'), albumin=c('Serum albumin','g/dL'),
  creatinine=c('Serum creatinine','mg/dL'), sbp=c('Systolic blood pressure','mmHg'),
  bmi=c('Body mass index','kg/m^2'))

source_map <- function(year, suffix) {
  early <- year <= 2003
  c(total_cholesterol=if(early) 'L13' else 'TCHOL',
    hdl=if(early) 'L13' else 'HDL',
    ldl=if(early) 'L13AM' else 'TRIGLY',
    triglycerides=if(early) 'L13AM' else 'TRIGLY',
    glucose=if(early) 'L10AM' else 'GLU', hba1c=if(early) 'L10' else 'GHB',
    crp=if(early) 'L11' else if(year<=2009) 'CRP' else if(year>=2015) 'HSCRP' else NA,
    wbc=if(early) 'L25' else 'CBC', albumin=if(early) 'L40' else 'BIOPRO',
    creatinine=if(early) 'L40' else 'BIOPRO', sbp='BPX', bmi='BMX')
}

# Explicit variables, never a fallback from conventional units to SI units.
variable_map <- function(year) c(total_cholesterol='LBXTC',
  hdl=if(year==2001) 'LBDHDL' else if(year==2003) 'LBXHDD' else 'LBDHDD',
  ldl='LBDLDL', triglycerides='LBXTR', glucose='LBXGLU', hba1c='LBXGH',
  crp=if(year>=2015) 'LBXHSCRP' else 'LBXCRP', wbc='LBXWBCSI', albumin='LBXSAL',
  creatinine=if(year==2001) 'LBDSCR' else 'LBXSCR', sbp='BPXSY1', bmi='BMXBMI')

read_source <- function(year, name) {
  path <- sprintf('pipeline/cache/%s/%s.xpt',year,name)
  d <- read.xport(path)
  stopifnot(!anyDuplicated(d$SEQN), !anyNA(d$SEQN))
  d
}

# Independent first-stage Taylor variance, retaining zeros outside the domain.
manual_se <- function(d, domain) {
  mu <- weighted.mean(d$value[domain], d$weight[domain])
  z <- numeric(nrow(d))
  z[domain] <- d$weight[domain]*(d$value[domain]-mu)/sum(d$weight[domain])
  totals <- aggregate(z, list(stratum=d$SDMVSTRA, psu=d$SDMVPSU), sum)
  v <- sum(vapply(split(totals$x,totals$stratum),function(x) {
    stopifnot(length(x)>1)
    length(x)/(length(x)-1)*sum((x-mean(x))^2)
  },numeric(1)))
  sqrt(v)
}

rows <- list(); mappings <- list(); checks <- list()
for (year in seq(2001,2017,2)) {
  suffix <- LETTERS[2+(year-2001)/2]
  cycle <- sprintf('%s-%s',year,year+1)
  demo <- read_source(year,paste0('DEMO_',suffix))
  sources <- source_map(year,suffix); variables <- variable_map(year)
  for (marker in names(markers)) {
    prefix <- sources[[marker]]
    if (is.na(prefix)) {
      mappings[[length(mappings)+1]] <- list(cycle=cycle,biomarker=marker,
        available=FALSE,note='CRP is not available in the selected public laboratory components for this cycle.')
      next
    }
    file <- paste0(prefix,'_',suffix)
    lab <- read_source(year,file)
    variable <- variables[[marker]]
    fasting <- marker %in% c('ldl','triglycerides','glucose')
    weight <- if(fasting) 'WTSAF2YR' else 'WTMEC2YR'
    keep <- unique(c('SEQN',variable,if(fasting) weight,
                     if(marker=='sbp') paste0('BPXSY',2:4)))
    stopifnot(all(keep %in% names(lab)))
    d <- merge(demo,lab[,keep,drop=FALSE],by='SEQN',all.x=TRUE,sort=FALSE)
    stopifnot(nrow(d)==nrow(demo))
    d$value <- d[[variable]]
    transformation <- 'As released by CDC.'
    if(marker=='crp' && year<=2009) {
      d$value <- d$value*10
      transformation <- 'LBXCRP mg/dL multiplied by 10 to mg/L.'
    }
    if(marker=='sbp') {
      d$value <- apply(d[,paste0('BPXSY',1:4)],1,function(x) {
        readings <- x[is.finite(x)]
        if(length(readings)==0) NA_real_ else mean(head(readings,3))
      })
      transformation <- 'Mean of up to three available auscultatory readings in attempt order (BPXSY1-4); fourth attempt fills an incomplete earlier attempt.'
      variable <- 'BPXSY1, BPXSY2, BPXSY3, BPXSY4'
    }
    if(marker=='creatinine' && year==2005) {
      d$value <- -0.016 + 0.978*d$value
      transformation <- 'CDC recommended calibration: -0.016 + 0.978 * LBXSCR.'
    }
    d$weight <- d[[weight]]
    d <- d[is.finite(d$weight) & d$weight>0,,drop=FALSE]
    d$component_eligible <- TRUE
    eligibility_note <- 'Positive MEC examination weight; adults aged 20 years or older.'
    if(fasting) {
      fast_file <- paste0(if(year<=2003) 'PH_' else 'FASTQX_',suffix)
      fast <- read_source(year,fast_file)
      d <- merge(d,fast[,c('SEQN','PHAFSTHR','PHAFSTMN','PHDSESN')],by='SEQN',all.x=TRUE,sort=FALSE)
      hours <- d$PHAFSTHR + d$PHAFSTMN/60
      minimum <- if(year==2001 || (marker!='glucose' && year<2017)) 8.5 else 8
      # PHDSESN: 0 morning, 1 afternoon, 2 evening in every selected codebook.
      d$component_eligible <- is.finite(hours) & hours>=minimum & hours<24 & !is.na(d$PHDSESN) & d$PHDSESN==0
      eligibility_note <- sprintf('Positive component fasting weight; morning session; fasting >= %s and < 24 hours; adults aged 20 years or older.',minimum)
    }
    stopifnot(!anyNA(d[,c('SDMVSTRA','SDMVPSU','RIDAGEYR','RIAGENDR')]))
    d$age_group <- as.character(cut(d$RIDAGEYR,c(20,30,40,50,60,70,80,Inf),
                                  labels=age_labels,right=FALSE))
    design <- svydesign(ids=~SDMVPSU,strata=~SDMVSTRA,weights=~weight,data=d,nest=TRUE)
    for(sex in c('all','1','2')) for(age in c('all',age_labels)) {
      eligible <- d$RIDAGEYR>=20 & (sex=='all' | d$RIAGENDR==as.numeric(if(sex=='all') '0' else sex))
      if(age!='all') eligible <- eligible & !is.na(d$age_group) & d$age_group==age
      weight_positive_n <- sum(eligible)
      eligible <- eligible & d$component_eligible
      domain <- eligible & is.finite(d$value)
      n <- sum(domain); denominator <- sum(eligible)
      if(n==0) stop(sprintf('Unexpected empty domain: %s %s %s %s',cycle,marker,sex,age))
      subdesign <- design[domain,]
      estimate <- svymean(~value,subdesign)
      mu <- as.numeric(coef(estimate)); se <- as.numeric(SE(estimate)); df <- degf(subdesign)
      ci <- if(df>0) mu+c(-1,1)*qt(.975,df)*se else c(NA_real_,NA_real_)
      # Independently check selected domains in every cycle/biomarker.
      if(sex=='all' && age %in% c('all','80+')) {
        independent <- manual_se(d,domain)
        stopifnot(abs(independent-se)<1e-8)
        checks[[length(checks)+1]] <- list(cycle=cycle,biomarker=marker,age_group=age,
          survey_se=se,independent_se=independent)
      }
      rows[[length(rows)+1]] <- list(cycle=cycle,biomarker=marker,sex=sex,age_group=age,
        mean=mu,se=se,ci_lower=ci[1],ci_upper=ci[2],df=df,n=n,eligible_n=denominator,
        observed_weight_sum=sum(d$weight[domain]),
        missing_n=denominator-n,weighted_missing_percent=100*sum(d$weight[eligible & !domain])/sum(d$weight[eligible]),
        weight_positive_n=weight_positive_n,eligibility_excluded_n=weight_positive_n-denominator,
        small_sample=n<30,weight=weight,unit=markers[[marker]][2])
    }
    mappings[[length(mappings)+1]] <- list(cycle=cycle,biomarker=marker,available=TRUE,
      file=file,variable=variable,weight=weight,transformation=transformation,
      eligibility=eligibility_note,
      fasting_codebook=if(fasting) sprintf('https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/%s/DataFiles/%s.htm',year,fast_file) else NA_character_,
      codebook=sprintf('https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/%s/DataFiles/%s.htm',year,file))
  }
  cat('Estimated',cycle,'\n')
}
output <- list(metadata=list(source='CDC/NCHS NHANES public-use participant data',
  status='Exploratory separate-cycle age/sex profiles',
  data_kind='observed',schema_version=1,
  survey_package=as.character(packageVersion('survey')), r_version=R.version.string,
  method='Taylor linearized survey means; domain-specific t intervals; no pooled cycles.'),
  biomarkers=lapply(names(markers),function(k) list(key=k,label=markers[[k]][1],unit=markers[[k]][2])),
  mappings=mappings,data=rows)
write_json(output,'data/nhanes_data.json',auto_unbox=TRUE,pretty=TRUE,digits=12,na='null')
write_json(checks,'data/variance_checks.json',auto_unbox=TRUE,pretty=TRUE,digits=12)
writeLines(capture.output(sessionInfo()),'data/r-session.txt')
cat('Saved',length(rows),'estimates and',length(checks),'independent variance checks.\n')
