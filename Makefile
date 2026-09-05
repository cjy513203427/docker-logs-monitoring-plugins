IMAGE=local/docker-logs-console
# The published name. Local dev deliberately keeps building `local/...` -
# see the NB block on `update` for why that name's un-pullability shapes the
# install dance - while releases go out under the Docker Hub account.
HUB_IMAGE=cjy513203427/docker-logs-console
TAG=0.4.1
PLATFORMS=linux/amd64,linux/arm64
BUILDER=logs-console-multiarch

.PHONY: build install update remove validate validate-hub dev-debug dev-ui reset-dev buildx-setup publish help

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

# NB: this validates the *local* single-arch build, so its "image is
# multiplatform" check always fails here ("Use --platform=linux/amd64,
# linux/arm64 when pushing your image to DockerHub") - by construction, not
# because anything is wrong. Use it for the label/metadata.json checks
# during development; the verdict that matters for a Marketplace submission
# comes from `make validate-hub` against the pushed multi-arch image.
validate: build ## Validate the built image against the extension spec
	docker extension validate $(IMAGE):$(TAG)

validate-hub: ## Validate the pushed multi-arch image (what the submission bot runs)
	docker extension validate $(HUB_IMAGE):$(TAG)

# NB: a plain `docker build` produces a single-arch image - whatever this
# machine is (linux/amd64 here). Docker Desktop can only install an
# extension whose image has a manifest entry matching the user's
# architecture, so an amd64-only push is uninstallable on Apple Silicon,
# which is most Mac users. Releases therefore go out through buildx as a
# two-platform manifest list. This needs the `docker-container` driver:
# Desktop's default `desktop-linux` builder uses the `docker` driver, which
# rejects a multi-platform build unless the containerd image store is on.
buildx-setup: ## Create the multi-arch builder (one-time, safe to re-run)
	docker buildx inspect $(BUILDER) >/dev/null 2>&1 || \
	  docker buildx create --name $(BUILDER) --driver docker-container --bootstrap

# NB: multi-platform results cannot be `--load`ed into the classic image
# store, so this builds straight to the registry with --push rather than
# `docker tag`-ing the local build. Requires `docker login` first.
publish: buildx-setup ## Build a multi-arch image and push it to Docker Hub
	docker buildx build --builder $(BUILDER) --platform $(PLATFORMS) \
	  -t $(HUB_IMAGE):$(TAG) -t $(HUB_IMAGE):latest --push .
	docker buildx imagetools inspect $(HUB_IMAGE):$(TAG)

dev-ui: ## Point the installed extension's UI at the local Vite dev server (run `npm run dev` in ui/ first)
	docker extension dev ui-source $(IMAGE):$(TAG) http://localhost:3000

dev-debug: ## Open devtools for the extension's UI
	docker extension dev debug $(IMAGE):$(TAG)

reset-dev: ## Stop pointing the extension at the dev server
	docker extension dev reset $(IMAGE):$(TAG)

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-12s\033[0m %s\n", $$1, $$2}'
