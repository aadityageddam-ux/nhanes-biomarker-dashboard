library(foreign)
if(dir.exists('pipeline/library')) .libPaths(c('pipeline/library',.libPaths()))
library(survey)
demo <- read.xport('pipeline/cache/2001/DEMO_B.xpt')
hdl <- read.xport('pipeline/cache/2001/L13_B.xpt')
d <- merge(demo,hdl,by='SEQN',all.x=TRUE)
for(w in c('WTMEC2YR','WTMEC4YR')) {
  d$w <- d[[w]]
  design <- svydesign(ids=~SDMVPSU,strata=~SDMVSTRA,weights=~w,data=d[d$w>0,],nest=TRUE)
  result <- svymean(~LBDHDL,subset(design,RIDAGEYR>=20),na.rm=TRUE)
  cat(w,as.numeric(coef(result)),as.numeric(SE(result)),'\n')
}
