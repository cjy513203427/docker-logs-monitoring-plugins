IMAGE=local/docker-logs-console
TAG=0.0.1

.PHONY: build install update remove validate dev-debug dev-ui reset-dev help

build: ## Build the extension image
	docker build -t $(IMAGE):$(TAG) .

install: build ## Build and install the extension into Docker Desktop
	docker extension install $(IMAGE):$(TAG) --force

update: build ## Rebuild and update the already-installed extension
	docker extension update $(IMAGE):$(TAG)

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
