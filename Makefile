IMAGE=local/docker-logs-console
TAG=0.3.0

.PHONY: build install update remove validate dev-debug dev-ui reset-dev help

build: ## Build the extension image
	docker build -t $(IMAGE):$(TAG) .

install: build ## Build and install the extension into Docker Desktop
	docker extension install $(IMAGE):$(TAG) --force

# NB: deliberately `rm` + `install --force`, not `docker extension update`.
# `update` removes the extension and then tries to *pull* the new image from
# a registry - which always fails for a locally-built `local/...` image
# ("pull access denied ... repository does not exist"), leaving the
# extension uninstalled. And `install --force` alone isn't enough either:
# `install` refuses with "already installed" if *any* tag of this repo is
# currently installed, regardless of --force or whether the requested tag
# differs (confirmed by hand going from an installed 0.2.0 to a freshly
# built 0.3.0 - --force only suppresses install's confirmation prompt, not
# this check). `docker extension rm $(IMAGE)` (bare repo, no tag needed -
# it removes whatever tag is currently installed) first, then a plain
# install, is the combination that actually works. The leading `-` tells
# Make to ignore `rm`'s exit code so this doesn't fail on a first-ever
# install with nothing to remove yet.
#
# NB: `rm` runs BEFORE the build (hence no `update: build` prerequisite and
# an explicit `docker build` line here). `docker extension rm` also deletes
# the extension's *image* from the local daemon - it prints "Extension image
# local/docker-logs-console:0.3.0 removed" - so building first and removing
# second throws the fresh build away, and the following `install` then falls
# back to trying to *pull* `local/...` and dies with "pull access denied"
# while leaving the extension uninstalled. Confirmed by hand.
update: ## Rebuild and update the already-installed extension
	-docker extension rm $(IMAGE)
	docker build -t $(IMAGE):$(TAG) .
	docker extension install $(IMAGE):$(TAG) --force

remove: ## Remove the installed extension
	docker extension rm $(IMAGE):$(TAG)

validate: build ## Validate the built image against the extension spec
	docker extension validate $(IMAGE):$(TAG)

dev-ui: ## Point the installed extension's UI at the local Vite dev server (run `npm run dev` in ui/ first)
	docker extension dev ui-source $(IMAGE):$(TAG) http://localhost:3000

dev-debug: ## Open devtools for the extension's UI
	docker extension dev debug $(IMAGE):$(TAG)

reset-dev: ## Stop pointing the extension at the dev server
	docker extension dev reset $(IMAGE):$(TAG)

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-12s\033[0m %s\n", $$1, $$2}'
