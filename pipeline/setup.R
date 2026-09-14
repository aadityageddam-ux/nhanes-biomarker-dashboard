# Install analysis dependencies into an ignored repository-local library.
dir.create('pipeline/library',recursive=TRUE,showWarnings=FALSE)
.libPaths(c('pipeline/library',.libPaths()))
install.packages(c('survey','foreign','jsonlite'),lib='pipeline/library',
                 repos='https://cloud.r-project.org')
cat('Compare installed versions with data/r-session.txt when reproducing results.\n')

