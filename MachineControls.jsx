import { useContext } from 'react';
import { GameContext } from '../context/GameContext';

function MachineControls() {
  const {
    canBuildMachine,
    canAfford,
    calculateMachineCost,
    buildMachine,
    gridSize
  } = useContext(GameContext);

  // Example: show a list of possible machines
  const machineTypes = ['catLair','reactor','amplifier','incubator'];

  const handleBuild = (type) => {
    // Just place it at (100,100) for test
    buildMachine(type, 100, 100);
  };

  return (
    <div style={{ background: '#222', padding: '10px', color: '#fff' }}>
      <h3>Machine Controls</h3>
      {machineTypes.map((type) => {
        const cost = calculateMachineCost(type);
        const canBuild = canBuildMachine(type);
        const affordable = canAfford(cost);

        return (
          <div key={type} style={{ marginBottom: '8px' }}>
            <button
              disabled={!canBuild || !affordable}
              onClick={() => handleBuild(type)}
            >
              Build {type}
            </button>
            <span style={{ marginLeft: '10px' }}>
              Cost: {JSON.stringify(cost)}
              {(!canBuild) && ' [Cannot Build]'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default MachineControls;
