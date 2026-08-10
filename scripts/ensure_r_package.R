#!/usr/bin/env Rscript

args <- commandArgs(trailingOnly = TRUE)
package_index <- match("--package", args)
if (is.na(package_index) || package_index == length(args)) {
  stop("必须以 --package 指定 CRAN 包名。", call. = FALSE)
}

package_name <- trimws(args[[package_index + 1]])
if (!grepl("^[A-Za-z][A-Za-z0-9.]+$", package_name)) {
  stop("R 包名只能由字母、数字和点组成，且不能包含路径、URL 或安装参数。", call. = FALSE)
}

app_root <- Sys.getenv("LMENTOR_APP_ROOT", unset = "")
if (!nzchar(app_root)) {
  app_root <- normalizePath(file.path(dirname(commandArgs(FALSE)[grep("^--file=", commandArgs(FALSE))][1]), ".."), winslash = "/", mustWork = FALSE)
}
library_root <- Sys.getenv("LMENTOR_R_LIBRARY", unset = file.path(app_root, ".Rlib"))
dir.create(library_root, recursive = TRUE, showWarnings = FALSE)
.libPaths(c(library_root, .libPaths()))

if (!requireNamespace(package_name, quietly = TRUE, lib.loc = library_root)) {
  install.packages(package_name, lib = library_root, repos = "https://cloud.r-project.org", type = "binary", quiet = TRUE)
}
if (!requireNamespace(package_name, quietly = TRUE, lib.loc = library_root)) {
  stop(sprintf("安装完成后仍无法加载 R 包：%s", package_name), call. = FALSE)
}

cat(sprintf('{"package":"%s","available":true,"install_target":"%s"}\n', package_name, normalizePath(library_root, winslash = "/", mustWork = FALSE)))
