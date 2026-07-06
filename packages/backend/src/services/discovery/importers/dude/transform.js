// packages/backend/src/services/discovery/importers/dude/transform.js
//
// Pure mapping helpers that turn parsed Dude objects (dudeId + typeName +
// fields, see DudeObjectParser.js) into rows for our own Prisma models.
// Kept separate from DudeImporter.js so the id/reference resolution logic
// can be read (and tested) without the SQLite/Prisma plumbing around it.

export function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/** The Dude stores an IPv4 address as a little-endian int32. */
export function decodeIpv4(int32Value) {
  if (typeof int32Value !== 'number') return null;
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(int32Value, 0);
  return Array.from(buf).join('.');
}

export function groupByType(objects) {
  const groups = {};
  for (const obj of objects) {
    if (!groups[obj.typeName]) groups[obj.typeName] = [];
    groups[obj.typeName].push(obj);
  }
  return groups;
}

/**
 * Every Notes/Device/Map/Service/... object carries a generic SysId that
 * equals the `objs.id` row it came from, plus a generic SysName used as
 * that object's display name (and, for Notes objects specifically, as the
 * free-text note body itself).
 */
export function displayName(fields, fallback) {
  const name = fields.SysName;
  return typeof name === 'string' && name.length > 0 ? name : fallback;
}

/**
 * A Map object can be placed as a submap element on another map -
 * NetworkMapElement rows with ItemType 0 place a Device, ItemType 2
 * places a submap (its ItemID resolves to another Map object). Returns
 * childMapDudeId -> parentMapDudeId.
 */
export function resolveMapHierarchy(networkMapElements, byId) {
  const parentOf = new Map();
  for (const nme of networkMapElements) {
    const itemId = nme.fields.NetworkMapElement_ItemID;
    const target = byId.get(itemId);
    if (target?.typeName === 'Map' && !parentOf.has(itemId)) {
      parentOf.set(itemId, nme.fields.NetworkMapElement_MapID);
    }
  }
  return parentOf;
}

/**
 * NetworkMapElement rows with ItemType 0 place a Device on a map at a
 * given position. Returns deviceDudeId -> { mapDudeId, x, y } (first
 * placement wins if a device was dropped on more than one map).
 */
export function resolveDevicePlacement(networkMapElements) {
  const placement = new Map();
  for (const nme of networkMapElements) {
    if (nme.fields.NetworkMapElement_ItemType !== 0) continue;
    const deviceId = nme.fields.NetworkMapElement_ItemID;
    if (placement.has(deviceId)) continue;
    placement.set(deviceId, {
      mapDudeId: nme.fields.NetworkMapElement_MapID,
      x: nme.fields.NetworkMapElement_ItemX ?? null,
      y: nme.fields.NetworkMapElement_ItemY ?? null,
    });
  }
  return placement;
}

/**
 * A Link only stores its "master" device directly. The other end has to
 * be found via the map element that draws the link's line: that element's
 * LinkFrom/LinkTo point at the two *endpoint* elements (device placements),
 * whose ItemID gives us the actual device on each side.
 */
export function resolveLinkOtherDevice(link, nmeById, byId) {
  const connector = nmeById.get(link.fields.Link_NetMapElementID);
  if (!connector) return null;

  const fromNme = nmeById.get(connector.NetworkMapElement_LinkFrom);
  const toNme = nmeById.get(connector.NetworkMapElement_LinkTo);
  const endpoints = [fromNme, toNme]
    .filter((nme) => nme?.NetworkMapElement_ItemType === 0)
    .map((nme) => nme.NetworkMapElement_ItemID)
    .filter((id) => id !== undefined && id !== null && id !== -1 && byId.get(id)?.typeName === 'Device');

  const masterDeviceId = link.fields.Link_MasterDevice;
  const other = endpoints.find((id) => id !== masterDeviceId);
  return other ?? null;
}

export default {
  chunk,
  decodeIpv4,
  groupByType,
  displayName,
  resolveMapHierarchy,
  resolveDevicePlacement,
  resolveLinkOtherDevice,
};
