"""Binary sensor — odczyt cyfrowy @gcd."""
from __future__ import annotations
from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from .const import (
    CIRCUIT_GCD, CONF_HOST, CONF_NAME, CONF_VARS, DOMAIN,
    ENTITY_BINARY_SENSOR, VAR_CIRCUIT, VAR_DEVICE_CLASS,
    VAR_ENTITY_TYPE, VAR_NAME,
)
from .coordinator import SterboxCoordinator
from .entity_base import SterboxEntity

async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    config      = {**entry.data, **(entry.options or {})}
    coordinator = hass.data[DOMAIN][entry.entry_id]
    name        = config.get(CONF_NAME, entry.title)
    host        = config.get(CONF_HOST, "")
    entities = [
        SterboxBinarySensor(coordinator, v, name, host, entry.entry_id)
        for v in config.get(CONF_VARS, [])
        if v.get(VAR_CIRCUIT) == CIRCUIT_GCD and v.get(VAR_ENTITY_TYPE) == ENTITY_BINARY_SENSOR
    ]
    if entities:
        async_add_entities(entities)

class SterboxBinarySensor(SterboxEntity, BinarySensorEntity):
    def __init__(self, coordinator, var, instance_name, host, entry_id):
        super().__init__(coordinator, var, instance_name, host, entry_id)
        self._attr_device_class = var.get(VAR_DEVICE_CLASS) or None

    @property
    def is_on(self):
        if not self.coordinator.data: return None
        v = self.coordinator.data.get(self._var_name)
        return None if v is None else bool(int(v))

    @property
    def available(self):
        return (self.coordinator.last_update_success
                and self.coordinator.data is not None
                and self._var_name in self.coordinator.data)
