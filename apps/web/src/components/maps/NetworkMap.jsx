import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

const STATUS_FILLS = { ok: '#22c55e', up: '#22c55e', warning: '#f59e0b', critical: '#ef4444', down: '#ef4444', unknown: '#6b7280' };
const LINK_COLORS = { low: '#22c55e', mid: '#f59e0b', high: '#ef4444', idle: '#4a5568' };

function getStatusColor(status) {
  return STATUS_FILLS[status] || STATUS_FILLS.unknown;
}

function getLinkColor(bandwidthMbps) {
  if (!bandwidthMbps) return LINK_COLORS.idle;
  if (bandwidthMbps < 50) return LINK_COLORS.low;
  if (bandwidthMbps < 80) return LINK_COLORS.mid;
  return LINK_COLORS.high;
}

function getDeviceShape(deviceType) {
  const shapes = {
    router: { type: 'diamond' },
    switch: { type: 'rect', rx: 6 },
    server: { type: 'rect', rx: 0 },
    workstation: { type: 'circle' },
    access_point: { type: 'circle' },
    firewall: { type: 'hexagon' },
  };
  return shapes[deviceType] || shapes.workstation;
}

function drawShape(g, shape, size, color) {
  const s = size || 20;
  if (shape.type === 'diamond') {
    g.append('polygon').attr('points', `0,${-s} ${s},0 0,${s} ${-s},0`).attr('fill', color).attr('stroke', '#fff').attr('stroke-width', 1.5);
  } else if (shape.type === 'hexagon') {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      pts.push(`${s * Math.cos(a)},${s * Math.sin(a)}`);
    }
    g.append('polygon').attr('points', pts.join(' ')).attr('fill', color).attr('stroke', '#fff').attr('stroke-width', 1.5);
  } else if (shape.type === 'rect') {
    g.append('rect').attr('x', -s).attr('y', -s * 0.7).attr('width', s * 2).attr('height', s * 1.4).attr('rx', shape.rx || 0).attr('fill', color).attr('stroke', '#fff').attr('stroke-width', 1.5);
  } else {
    g.append('circle').attr('r', s).attr('fill', color).attr('stroke', '#fff').attr('stroke-width', 1.5);
  }
  return g;
}

export const NetworkMap = ({
  map, devices, links,
  onDeviceClick, onDeviceContextMenu, onCanvasContextMenu, onLinkContextMenu,
  onDeviceMove, readonly, selectedDevice, zoomRef,
}) => {
  const svgRef = useRef(null);
  const [internalSelected, setInternalSelected] = useState(null);
  const simulationRef = useRef(null);
  const sel = selectedDevice !== undefined ? selectedDevice : internalSelected;

  useEffect(() => {
    let sim = null;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.node().__zoom = null;

    svg.on('contextmenu', (event) => {
      event.preventDefault();
      if (onCanvasContextMenu) onCanvasContextMenu(event);
    });

    const defs = svg.append('defs');
    defs.append('pattern').attr('id', 'grid').attr('width', 40).attr('height', 40).attr('patternUnits', 'userSpaceOnUse')
      .append('path').attr('d', 'M 40 0 L 0 0 0 40').attr('fill', 'none').attr('stroke', '#2a2a4a').attr('stroke-width', 0.5);

    if (!devices || devices.length === 0) return () => { if (zoomRef) zoomRef.current = null; };

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const g = svg.append('g');

    const zoom = d3.zoom().scaleExtent([0.1, 4]).on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);
    if (zoomRef) {
      const svgSel = d3.select(svgRef.current);
      zoomRef.current = {
        zoomIn: () => svgSel.transition().duration(300).call(zoom.scaleBy, 1.3),
        zoomOut: () => svgSel.transition().duration(300).call(zoom.scaleBy, 0.7),
        resetView: () => svgSel.transition().duration(300).call(zoom.transform, d3.zoomIdentity),
      };
    }

    g.append('rect').attr('width', width).attr('height', height).attr('fill', 'url(#grid)');

    if (map?.backgroundImage) {
      g.append('image').attr('href', map.backgroundImage).attr('width', width).attr('height', height).attr('opacity', 0.15);
    }

    const linkData = (links || []).map(link => ({
      ...link,
      source: devices.find(d => d.id === link.sourceDeviceId || d.id === link.source_device_id),
      target: devices.find(d => d.id === link.targetDeviceId || d.id === link.target_device_id),
    })).filter(link => link.source && link.target);

    sim = d3.forceSimulation(devices)
      .force('link', d3.forceLink(linkData).id(d => d.id).distance(160))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(60));
    simulationRef.current = sim;

    const link = g.append('g').selectAll('line').data(linkData).join('line')
      .attr('stroke', d => getLinkColor(d.bandwidthMbps || d.bandwidth_mbps))
      .attr('stroke-opacity', 0.7)
      .attr('stroke-width', d => Math.max(2, Math.min((d.bandwidthMbps || d.bandwidth_mbps || 100) / 100, 8)))
      .style('cursor', 'pointer')
      .on('contextmenu', (event, d) => {
        event.preventDefault();
        event.stopPropagation();
        if (onLinkContextMenu) onLinkContextMenu(event, d);
      });

    const linkLabel = g.append('g').selectAll('text').data(linkData).join('text')
      .attr('font-size', 10).attr('fill', '#888').attr('text-anchor', 'middle')
      .text(d => d.label || '');

    const node = g.append('g').selectAll('g').data(devices).join('g')
      .style('cursor', readonly ? 'pointer' : 'grab')
      .on('click', (event, d) => {
        event.stopPropagation();
        setInternalSelected(d.id);
        if (onDeviceClick) onDeviceClick(d);
      })
      .on('contextmenu', (event, d) => {
        event.preventDefault();
        event.stopPropagation();
        if (onDeviceContextMenu) onDeviceContextMenu(event, d);
      });

    if (!readonly) {
      node.call(d3.drag()
        .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null; d.fy = null;
          if (onDeviceMove) onDeviceMove(d.id, event.x, event.y);
        }));
    }

    node.each(function (d) {
      const g = d3.select(this);
      const shape = getDeviceShape(d.deviceType || d.device_type);
      const color = getStatusColor(d.status);
      const size = shape.type === 'rect' ? 22 : 18;
      drawShape(g, shape, size, color);
      if (d.id === sel) {
        g.select('polygon, rect, circle').attr('stroke', '#60a5fa').attr('stroke-width', 3);
      }
      g.append('text').attr('dy', size + 14).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#e2e8f0').attr('font-weight', 600).text(d.name || d.label);
      g.append('text').attr('dy', size + 26).attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', '#888').text(d.ip);
      if (d.submapCount || d._count?.submaps) {
        g.append('text').attr('x', size + 4).attr('y', -size + 4).attr('font-size', 12).attr('fill', '#3b82f6').text('↗');
      }
    });

    sim.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      linkLabel.attr('x', d => (d.source.x + d.target.x) / 2).attr('y', d => (d.source.y + d.target.y) / 2);
      node.attr('transform', d => `translate(${d.positionX || d.position_x || d.x},${d.positionY || d.position_y || d.y})`);
    });

    return () => {
      if (sim) sim.stop();
      if (zoomRef) zoomRef.current = null;
    };
  }, [devices, links, map, sel, readonly, onDeviceClick, onDeviceContextMenu, onCanvasContextMenu, onLinkContextMenu, onDeviceMove]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#1a1a2e' }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
};

export default NetworkMap;
