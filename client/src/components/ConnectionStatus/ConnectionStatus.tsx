import { useConnectionStore } from '../../stores/connectionStore';
import './ConnectionStatus.css';

export function ConnectionStatus() {
  const isConnected = useConnectionStore((state) => state.isConnected);
  const isConnecting = useConnectionStore((state) => state.isConnecting);
  const error = useConnectionStore((state) => state.error);

  return (
    <div className="connection-status">
      <div className={`status-indicator ${isConnected ? 'connected' : isConnecting ? 'connecting' : 'disconnected'}`} />
      <span className="status-text">
        {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : error || 'Disconnected'}
      </span>
    </div>
  );
}


