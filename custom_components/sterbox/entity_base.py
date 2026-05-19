"""Bazowa klasa encji Sterboxa — DeviceInfo, unique_id oparty o circuit+query."""
from __future__ import annotations
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from .const import DOMAIN
from .coordinator import SterboxCoordinator


def build_device_info(entry_id: str, instance_name: str, host: str) -> DeviceInfo:
    return DeviceInfo(
        identifiers={(DOMAIN, entry_id)},
        name=instance_name,
        manufacturer="ENIGMA",
        model="Sterbox HA API Integration",
        sw_version="1.0.0",
        configuration_url=f"http://{host}",
    )


def build_unique_id(entry_id: str, circuit: str, query: str) -> str:
    """
    unique_id oparty o circuit+query — fizyczny adres obwodu w PLC.
    Zmiana nazwy zmiennej (friendly_name) NIE zmienia unique_id.
    Encja i jej historia pozostają bez zmian przy zmianie nazwy.

    Format: sterbox_{entry_id}_{circuit}_{query}
    Przykład: sterbox_abc123_gcd_ro1ups
    """
    query_slug = query.lower().replace(" ", "_")
    return f"sterbox_{entry_id}_{circuit}_{query_slug}"


class SterboxEntity(CoordinatorEntity[SterboxCoordinator]):
    """
    Bazowa klasa encji.
    _attr_has_entity_name = True — HA buduje friendly_name jako:
        "{device.name} {entity.name}"
    np. "Dom temp_k", "Garaż ro1_stan"
    """
    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: SterboxCoordinator,
        var_config: dict,
        instance_name: str,
        host: str,
        entry_id: str,
    ) -> None:
        super().__init__(coordinator)
        self._var_name = var_config["name"]
        circuit = var_config["circuit"]
        query   = var_config["query"]

        # unique_id oparty o circuit+query — niezmienny przy zmianie nazwy
        self._attr_unique_id  = build_unique_id(entry_id, circuit, query)
        # Nazwa encji — tylko fragment po nazwie urządzenia
        self._attr_name       = self._var_name
        self._attr_device_info = build_device_info(entry_id, instance_name, host)
