// packages/backend/src/services/discovery/importers/dude/format/objectTypes.js
//
// The Dude tags every object with a "DataFormat" value - the first field
// in every blob, always an IntArray field of one entry naming the object's
// type. Values ported from the community reverse-engineering of the format
// (see README acknowledgments).

export const DataFormat = Object.freeze({
  0x03: 'ServerConfig',
  0x04: 'Tool',
  0x05: 'File',
  0x09: 'Notes',
  0x0a: 'Map',
  0x0d: 'Probe',
  0x0e: 'DeviceType',
  0x0f: 'Device',
  0x10: 'Network',
  0x11: 'Service',
  0x18: 'Notification',
  0x1f: 'Link',
  0x22: 'LinkType',
  0x29: 'DataSource',
  0x2a: 'ObjectList',
  0x31: 'DeviceGroup',
  0x39: 'Function',
  0x3a: 'SnmpProfile',
  0x3b: 'Panel',
  0x43: 'SysLogRule',
  0x4a: 'NetworkMapElement',
  0x4b: 'ChartLine',
  0x4d: 'PanelElement',
});

export function dataFormatName(typeId) {
  return DataFormat[typeId] ?? `Unknown_0x${typeId.toString(16)}`;
}

export default DataFormat;
