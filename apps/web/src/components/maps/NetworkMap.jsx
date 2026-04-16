// apps/web/src/components/maps/NetworkMap.jsx

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

/**
 * @typedef {Object} Device
 * @property {string} id
 * @property {string} name
 * @property {string} ip
 * @property {string} status - up, down, warning, unknown
 * @property {string} device_type
 * @property {number} [position_x]
 * @property {number} [position_y]
 */

/**
 * @typedef {Object} Link
 * @property {string} id
 * @property {string} source_device_id
 * @property {string} target_device_id
 * @property {string} [label]
 * @property {number} [bandwidth_mbps]
 */

/**
 * Interactive network topology map component
 * @param {Object} props
 * @param {Object} props.map - Map configuration
 * @param {Device[]} props.devices - Array of devices to display
 * @param {Link[]} props.links - Array of links between devices
 * @param {Function} [props.onDeviceClick] - Callback when device is clicked
 * @param {Function} [props.onDeviceMove] - Callback when device is moved
 * @param {boolean} [props.readonly] - Disable drag interactions
 */
export const NetworkMap = ({ 
  map, 
  devices, 
  links, 
  onDeviceClick, 
  onDeviceMove,
  readonly = false 
}) => {
  const svgRef = useRef(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const simulationRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !devices || devices.length === 0) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Clear previous content
    svg.selectAll('*').remove();

    // Create main group for zoom/pan
    const g = svg.append('g');
    
    // Setup zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Add background image if provided
    if (map?.background_image) {
      g.append('image')
        .attr('href', map.background_image)
        .attr('width', width)
        .attr('height', height)
        .attr('opacity', 0.3);
    }

    // Prepare link data (convert device IDs to objects)
    const linkData = links.map(link => ({
      ...link,
      source: devices.find(d => d.id === link.source_device_id),
      target: devices.find(d => d.id === link.target_device_id)
    })).filter(link => link.source && link.target);

    // Create force simulation
    const simulation = d3.forceSimulation(devices)
      .force('link', d3.forceLink(linkData)
        .id(d => d.id)
        .distance(150))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50));

    simulationRef.current = simulation;

    // Draw links
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(linkData)
      .join('line')
      .attr('class', 'link')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => {
        // Thicker lines for higher bandwidth
        return d.bandwidth_mbps ? Math.min(d.bandwidth_mbps / 100, 10) : 2;
      });

    // Draw link labels
    const linkLabel = g.append('g')
      .attr('class', 'link-labels')
      .selectAll('text')
      .data(linkData)
      .join('text')
      .attr('font-size', 10)
      .attr('fill', '#666')
      .attr('text-anchor', 'middle')
      .text(d => d.label || '');

    // Create device node groups
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(devices)
      .join('g')
      .attr('class', 'node')
      .style('cursor', readonly ? 'pointer' : 'grab')
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedDevice(d.id);
        if (onDeviceClick) {
          onDeviceClick(d);
        }
      });

    // Add drag behavior if not readonly
    if (!readonly) {
      node.call(d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded));
    }

    // Device circles
    node.append('circle')
      .attr('r', 20)
      .attr('fill', d => getStatusColor(d.status))
      .attr('stroke', d => d.id === selectedDevice ? '#000' : '#fff')
      .attr('stroke-width', d => d.id === selectedDevice ? 3 : 2);

    // Device icons/text
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 5)
      .attr('font-size', 16)
      .attr('fill', '#fff')
      .text(d => getDeviceIcon(d.device_type));

    // Device labels
    node.append('text')
      .attr('dy', 35)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('fill', '#333')
      .attr('font-weight', 'bold')
      .text(d => d.name);

    // IP address labels
    node.append('text')
      .attr('dy', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('fill', '#666')
      .text(d => d.ip);

    // Status indicator (small dot)
    node.append('circle')
      .attr('r', 5)
      .attr('cx', 15)
      .attr('cy', -15)
      .attr('fill', d => d.status === 'up' ? '#22c55e' : '#ef4444')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      linkLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);

      node.attr('transform', d => 
        `translate(${d.position_x || d.x},${d.position_y || d.y})`
      );
    });

    // Drag functions
    function dragStarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragEnded(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
      
      // Save new position
      if (onDeviceMove) {
        onDeviceMove(d.id, event.x, event.y);
      }
    }

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [devices, links, map, selectedDevice, readonly, onDeviceClick, onDeviceMove]);

  const handleResetView = () => {
    const svg = d3.select(svgRef.current);
    svg.transition().duration(750).call(
      d3.zoom().transform,
      d3.zoomIdentity
    );
  };

  const handleRelayout = () => {
    if (simulationRef.current) {
      simulationRef.current.alpha(1).restart();
    }
  };

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        className="w-full h-full bg-gray-50"
        style={{ cursor: readonly ? 'default' : 'grab' }}
      />
      
      {/* Map controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <button
          className="px-3 py-2 bg-white rounded shadow hover:bg-gray-100 text-sm font-medium"
          onClick={handleResetView}
          title="Reset zoom and pan"
        >
          🔄 Reset View
        </button>
        <button
          className="px-3 py-2 bg-white rounded shadow hover:bg-gray-100 text-sm font-medium"
          onClick={handleRelayout}
          title="Re-run force layout"
        >
          🎯 Re-layout
        </button>
        <div className="px-3 py-2 bg-white rounded shadow text-xs">
          <div className="font-semibold mb-1">Legend:</div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Online</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Offline</span>
          </div>
        </div>
      </div>

      {/* Device count */}
      <div className="absolute bottom-4 left-4 px-3 py-2 bg-white rounded shadow text-sm">
        <span className="font-semibold">{devices?.length || 0}</span> devices
      </div>
    </div>
  );
};

/**
 * Get color based on device status
 * @param {string} status
 * @returns {string} Hex color
 */
function getStatusColor(status) {
  const colors = {
    'up': '#22c55e',
    'down': '#ef4444',
    'warning': '#f59e0b',
    'unknown': '#9ca3af'
  };
  return colors[status] || colors.unknown;
}

/**
 * Get emoji icon for device type
 * @param {string} deviceType
 * @returns {string} Emoji
 */
function getDeviceIcon(deviceType) {
  const icons = {
    'router': '🔀',
    'switch': '⚡',
    'server': '🖥️',
    'workstation': '💻',
    'access_point': '📡',
    'firewall': '🛡️',
    'unknown': '❓'
  };
  return icons[deviceType] || icons.unknown;
}

export default NetworkMap;
