# Data tier: PostgreSQL Flexible Server (H3, D4), Azure Managed Redis (H4, D3),
# Blob Storage (H5, D5), Container Registry (H7, D12).

# ============================ PostgreSQL ============================

# ACCEPTED S1 EXCEPTION #1: the PG admin password is generated here and therefore sits in
# state (and in DATABASE-URL). The state account is Entra-only, versioned, shared-key off and
# not public (bootstrap.sh). Phase 8 moves PG to Entra auth and removes it.
resource "random_password" "postgres_admin" {
  length  = 32
  special = false # URL-safe; urlencode() is still applied when it is embedded in DATABASE-URL
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                = local.names.postgres
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags

  # Same major as Cloud SQL: never combine a PG upgrade with a cloud move (D4).
  version    = "16"
  sku_name   = var.postgres_sku
  storage_mb = var.postgres_storage_mb

  administrator_login    = "lynia_admin"
  administrator_password = random_password.postgres_admin.result

  backup_retention_days        = 7 # PITR 7 days
  geo_redundant_backup_enabled = false

  # Private access only: VNet-injected into snet-pg, resolvable via the private DNS zone. The
  # in-VNet migrate job removes the only reason for a public endpoint (D4, SECURITY.md P2-1).
  delegated_subnet_id           = azurerm_subnet.pg.id
  private_dns_zone_id           = azurerm_private_dns_zone.zone["postgres"].id
  public_network_access_enabled = false

  depends_on = [azurerm_private_dns_zone_virtual_network_link.zone]

  lifecycle {
    # Azure may place the server in a zone of its choosing; do not force a rebuild over it.
    ignore_changes = [zone]
  }
}

# PostGIS is the only extension (prisma/migrations/0001_init). It must be allow-listed before
# `CREATE EXTENSION postgis` can succeed (Gate 1).
resource "azurerm_postgresql_flexible_server_configuration" "extensions" {
  name      = "azure.extensions"
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = "POSTGIS"
}

resource "azurerm_postgresql_flexible_server_database" "lynia" {
  name      = "lynia"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# ============================ Redis ============================

# Azure Managed Redis, Balanced B0, NON-clustered: the tracking Lua touches undeclared keys and
# BullMQ keys carry no hash tags, so any clustered policy throws CROSSSLOT (D3, H4).
# TLS only (port 10000). HA off for the pilot.
#
# ACCEPTED S1 EXCEPTION #2: access-key auth is ON (AMR defaults to Entra-only, which ioredis /
# BullMQ do not speak here), and Terraform reads the key back to build REDIS-URL, so the key is in
# state. Phase 8 moves Redis to Entra auth and removes it.
resource "azurerm_managed_redis" "main" {
  name                      = local.names.redis
  location                  = azurerm_resource_group.main.location
  resource_group_name       = azurerm_resource_group.main.name
  sku_name                  = var.redis_sku
  high_availability_enabled = false
  public_network_access     = "Disabled"
  tags                      = local.tags

  default_database {
    clustering_policy                  = "NoCluster"
    client_protocol                    = "Encrypted"
    access_keys_authentication_enabled = true
    # BullMQ requires noeviction: an evicted job key is a silently lost job.
    eviction_policy = "NoEviction"
  }
}

resource "azurerm_private_endpoint" "redis" {
  name                = "pe-redis-lynia-${local.env_short}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  subnet_id           = azurerm_subnet.pe.id
  tags                = local.tags

  private_service_connection {
    name                           = "redis"
    private_connection_resource_id = azurerm_managed_redis.main.id
    subresource_names              = ["redisEnterprise"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "redis"
    private_dns_zone_ids = [azurerm_private_dns_zone.zone["redis"].id]
  }
}

# ============================ Blob storage ============================

locals {
  # CORS origin for direct SAS PUTs from the merchant dashboard (D5). Staging has no custom
  # domain by default, so it falls back to the merchant app's generated FQDN.
  merchant_origin = local.merchant_hostname != "" ? "https://${local.merchant_hostname}" : "https://${local.names.merchant}.${azurerm_container_app_environment.main.default_domain}"
}

resource "azurerm_storage_account" "media" {
  name                     = local.names.storage
  location                 = azurerm_resource_group.main.location
  resource_group_name      = azurerm_resource_group.main.name
  account_kind             = "StorageV2"
  account_tier             = "Standard"
  account_replication_type = "LRS"
  tags                     = local.tags

  # No account keys anywhere: uploads use USER-DELEGATION SAS minted with the API's managed
  # identity (D5). Shared key off also disables account-key SAS.
  shared_access_key_enabled       = false
  default_to_oauth_authentication = true
  allow_nested_items_to_be_public = false
  https_traffic_only_enabled      = true
  min_tls_version                 = "TLS1_2"

  # Public endpoint stays ENABLED: phones and the merchant browser PUT/GET blobs directly with a
  # SAS (E3). The API's own traffic uses the private endpoint below.
  public_network_access_enabled = true

  blob_properties {
    versioning_enabled = true

    delete_retention_policy {
      days = 14
    }
    container_delete_retention_policy {
      days = 14
    }

    cors_rule {
      allowed_origins    = [local.merchant_origin]
      allowed_methods    = ["GET", "HEAD", "PUT", "OPTIONS"]
      allowed_headers    = ["content-type", "x-ms-blob-type", "x-ms-version", "x-ms-date", "x-ms-client-request-id"]
      exposed_headers    = ["etag", "x-ms-request-id", "x-ms-version"]
      max_age_in_seconds = 3600
    }
  }
}

resource "azurerm_storage_container" "media" {
  name                  = "lynia-media"
  storage_account_id    = azurerm_storage_account.media.id
  container_access_type = "private"
}

resource "azurerm_private_endpoint" "blob" {
  name                = "pe-blob-lynia-${local.env_short}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  subnet_id           = azurerm_subnet.pe.id
  tags                = local.tags

  private_service_connection {
    name                           = "blob"
    private_connection_resource_id = azurerm_storage_account.media.id
    subresource_names              = ["blob"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "blob"
    private_dns_zone_ids = [azurerm_private_dns_zone.zone["blob"].id]
  }
}

# ============================ Container Registry ============================

resource "azurerm_container_registry" "main" {
  name                = local.names.acr
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "Basic"
  # No admin user: pulls use the apps' managed identities (AcrPull), pushes use the deploy
  # identity over OIDC (AcrPush). Nothing long-lived (D12).
  admin_enabled = false
  tags          = local.tags
}
