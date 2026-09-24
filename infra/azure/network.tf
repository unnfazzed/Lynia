# Resource group + private network (H13, E3).
#
# 10.20.0.0/16
#   snet-aca  10.20.0.0/23   Container Apps environment (delegated Microsoft.App/environments;
#                            workload-profiles envs need /27+, /23 leaves room to grow)
#   snet-pg   10.20.2.0/28   PostgreSQL Flexible Server (delegated; private access, D4)
#   snet-pe   10.20.2.16/28  Private endpoints: Redis, Blob, Key Vault

resource "azurerm_resource_group" "main" {
  name     = local.resource_group_name
  location = var.location
  tags     = local.tags
}

resource "azurerm_virtual_network" "main" {
  name                = local.names.vnet
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  address_space       = ["10.20.0.0/16"]
  tags                = local.tags
}

resource "azurerm_subnet" "aca" {
  name                 = "snet-aca"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.20.0.0/23"]

  delegation {
    name = "aca"
    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "pg" {
  name                 = "snet-pg"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.20.2.0/28"]

  delegation {
    name = "pg"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "pe" {
  name                 = "snet-pe"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.20.2.16/28"]
}

# ---- Private DNS zones, each linked to this VNet only ----

locals {
  private_dns_zones = {
    postgres = "lynia-${local.env_short}.private.postgres.database.azure.com"
    redis    = "privatelink.redis.azure.net"
    # blob / vault zones removed with their private endpoints (savings review 2026-09-24).
  }
}

resource "azurerm_private_dns_zone" "zone" {
  for_each            = local.private_dns_zones
  name                = each.value
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "zone" {
  for_each              = local.private_dns_zones
  name                  = "link-${each.key}"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.zone[each.key].name
  virtual_network_id    = azurerm_virtual_network.main.id
  registration_enabled  = false
  tags                  = local.tags
}
