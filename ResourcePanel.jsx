import { useContext } from 'react';
import { GameContext } from '../context/GameContext';

const ResourcePanel = () => {
  const { tcorvax, catNips, energy, formatResource } = useContext(GameContext);
  
  return (
    <div className="hud">
      <div className="panel-title">Resources</div>
      <div className="resource">
        <span className="resource-icon">💎</span>
        <span>TCorvax:</span>
        <span className="resource-value">{formatResource(tcorvax)}</span>
      </div>
      <div className="resource">
        <span className="resource-icon">🐱</span>
        <span>Cat Nips:</span>
        <span className="resource-value">{formatResource(catNips)}</span>
      </div>
      <div className="resource">
        <span className="resource-icon">⚡</span>
        <span>Energy:</span>
        <span className="resource-value">{formatResource(energy)}</span>
      </div>
    </div>
  );
};

export default ResourcePanel;
