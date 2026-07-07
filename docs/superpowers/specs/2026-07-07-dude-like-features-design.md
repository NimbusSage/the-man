# Dude-Like SNMP Poller, Maps, and Context Menus

## Overview

Make The MAN behave and look like MikroTik The Dude — full SNMP poller (ifTable, custom OIDs), network maps with submaps, and custom right-click context menus on devices, canvas, and links.

## Architecture

```
apps/desktop (Tauri 1.x)
  apps/web (React 18 + Vite)
    Maps Page | Device List | Settings
      ContextMenu (portal-based React component)
      NetworkMap (D3 dark canvas)
        |
    WebSocket (socket.io)    REST + JWT
        |
packages/backend (Fastify)
  API Routes (maps, devices, services) | SocketServer
  MonitoringService -> BullMQ queue
    |
  Postgres (Prisma)    Redis (BullMQ)
        |
  pollingWorker (BullMQ consumer)
    SNMPPoller | PingPoller
```

## Data Model

No Prisma schema changes. Existing models cover everything:
- `Map` - hierarchical maps (parentMapId for submaps)
- `Device` - devices with mapId, positionX, positionY
- `Link` - links between devices on a map
- `Service` - per-interface services (type: `snmp-if-{index}`)
- `Metric` / `MetricSample` - time-series metrics from polling

## SNMP Poller

**Library**: `node-snmp` (native Net-SNMP bindings)

**Worker**: BullMQ consumer in `pollingWorker.js` picks up jobs from `theman:polling` queue, dispatches to poller by type. Each interface is a separate Service (like The Dude). Auto-creates Service records on first discovery.

**OIDs polled**: ifDescr, ifType, ifSpeed, ifAdminStatus, ifOperStatus, ifInOctets, ifOutOctets, ifInErrors, ifOutErrors, ifHCInOctets, ifHCOutOctets. Custom OIDs from service config.

**Interface auto-creation**: First poll discovers all interfaces, creates Service records with `type: snmp-if-{ifIndex}`.

## Maps Page

- Dark canvas (`#1a1a2e`) with grid (`#16213e`)
- Device shapes: router=diamond, switch=rounded-rect, server=square
- Status colors: UP=green, DOWN=red, WARNING=yellow, UNKNOWN=gray
- Link utilization: green (<50%), yellow (50-80%), red (>80%)
- Submap badges on device nodes
- Breadcrumb navigation
- Properties panel on double-click

## Context Menu

Portal-based React component replacing browser default. Three trigger areas:
- **Device**: Ping, Telnet/SSH, Wake, Services, Properties, Ack/Unack, Delete
- **Canvas**: Add Device, Add Submap, Paste, Zoom In/Out, Reset View
- **Link**: Properties, Delete, Label

## Theme System

Single `DUDE_CLASSIC` theme constant in shared package. All colors customizable. Future: `MODERN` theme with toggle.

## Desktop

Tauri 1.x basic config (window 1400x900, title "The MAN").
