import { render, screen, fireEvent } from '@testing-library/react';
import EngineInspector from '../EngineInspector';
import { vi } from 'vitest';

// Mock all subcomponents
vi.mock('../../components/inspector/Sidebar', () => ({
  Sidebar: ({ activeTab, onTabChange }: any) => (
    <div data-testid="sidebar">
      <button onClick={() => onTabChange('world')}>World Tab</button>
      <span>Active: {activeTab}</span>
    </div>
  )
}));
vi.mock('../../components/inspector/Dashboard', () => ({ Dashboard: () => <div data-testid="dashboard" /> }));
vi.mock('../../components/world/WorldDashboard', () => ({ WorldDashboard: () => <div data-testid="world-dashboard" /> }));
vi.mock('../../components/inspector/WorldInspector', () => ({ WorldInspector: () => <div data-testid="world-inspector" /> }));
vi.mock('../../components/environment/EnvironmentDashboard', () => ({ EnvironmentDashboard: () => <div data-testid="environment-dashboard" /> }));
vi.mock('../../components/resources/ResourceInspector', () => ({ ResourceInspector: () => <div data-testid="resource-inspector" /> }));
vi.mock('../../components/spatial/SpatialDashboard', () => ({ SpatialDashboard: () => <div data-testid="spatial-dashboard" /> }));
vi.mock('../../components/inspector/QueueInspector', () => ({ QueueInspector: () => <div data-testid="queue-inspector" /> }));
vi.mock('../../components/inspector/HistoryInspector', () => ({ HistoryInspector: () => <div data-testid="history-inspector" /> }));
vi.mock('../../components/inspector/LiveLogs', () => ({ LiveLogs: () => <div data-testid="live-logs" /> }));
vi.mock('../../components/inspector/PerformanceView', () => ({ PerformanceView: () => <div data-testid="performance-view" /> }));
vi.mock('../../components/inspector/EventInjectionPanel', () => ({ EventInjectionPanel: () => <div data-testid="event-injection" /> }));

describe('EngineInspector Page', () => {
  it('renders Sidebar and default inspector tab', () => {
    render(<EngineInspector />);
    
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByText('Active: inspector')).toBeInTheDocument();
    expect(screen.getByTestId('world-inspector')).toBeInTheDocument();
    expect(screen.queryByTestId('world-dashboard')).not.toBeInTheDocument();
  });

  it('changes active tab when Sidebar calls onTabChange', () => {
    render(<EngineInspector />);
    
    // Default state
    expect(screen.getByTestId('world-inspector')).toBeInTheDocument();
    
    // Click button to change tab
    fireEvent.click(screen.getByText('World Tab'));
    
    expect(screen.getByText('Active: world')).toBeInTheDocument();
    expect(screen.queryByTestId('world-inspector')).not.toBeInTheDocument();
    expect(screen.getByTestId('world-dashboard')).toBeInTheDocument();
  });
});
