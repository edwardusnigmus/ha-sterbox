"""Sensor — odczyt analogowy @gca."""
from __future__ import annotations
import logging
from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from .const import (
    CIRCUIT_GCA, CONF_HOST, CONF_NAME, CONF_VARS, DOMAIN,
    ENTITY_SENSOR, VAR_CIRCUIT, VAR_DEVICE_CLASS,
    VAR_ENTITY_TYPE, VAR_NAME, VAR_PRECISION, VAR_QUERY, VAR_STATE_CLASS, VAR_UNIT,
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
        SterboxSensor(coordinator, v, name, host, entry.entry_id)
        for v in config.get(CONF_VARS, [])
        if v.get(VAR_CIRCUIT) == CIRCUIT_GCA and v.get(VAR_ENTITY_TYPE) == ENTITY_SENSOR
    ]
    if entities:
        async_add_entities(entities)

class SterboxSensor(SterboxEntity, SensorEntity):
    def __init__(self, coordinator, var, instance_name, host, entry_id):
        super().__init__(coordinator, var, instance_name, host, entry_id)
        self._attr_native_unit_of_measurement = var.get(VAR_UNIT) or None
        self._attr_device_class = var.get(VAR_DEVICE_CLASS) or None
        self._attr_state_class  = var.get(VAR_STATE_CLASS)  or None
        precision = var.get(VAR_PRECISION)
        if precision is not None:
            self._attr_suggested_display_precision = int(precision)

    @property
    def native_value(self):
        return self.coordinator.data.get(self._var_name) if self.coordinator.data else None

    @property
    def available(self):
        return (self.coordinator.last_update_success
                and self.coordinator.data is not None
                and self._var_name in self.coordinator.data)
