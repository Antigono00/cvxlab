import { useContext, useEffect, useState } from 'react';
import { GameContext } from '../context/GameContext';

const IncubatorWidget = ({ machineId, onClose }) => {
  const {
    activateMachine,
    machines,
    getStakedCvxBalance,
    isRadixConnected
  } = useContext(GameContext);

  const [stakedAmount, setStakedAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const machine = machines.find(m => m.id === machineId);

  useEffect(() => {
    const fetchStake = async () => {
      setIsLoading(true);
      if (isRadixConnected) {
        const val = await getStakedCvxBalance();
        setStakedAmount(val);
      } else {
        setStakedAmount(0);
      }
      setIsLoading(false);
    };
    fetchStake();
  }, [isRadixConnected, getStakedCvxBalance]);

  const calculateReward = () => {
    return Math.min(10, Math.floor(stakedAmount / 100));
  };

  const handleActivate = () => {
    if (machine) {
      activateMachine(machine);
    }
    onClose();
  };

  if (!machine) return null;

  return (
    <div className="welcome-message" style={{ maxWidth: '800px' }}>
      <h1>Incubator Staking</h1>

      {isLoading ? (
        <p>Loading your staking information...</p>
      ) : (
        <div style={{
          background: 'rgba(0, 0, 0, 0.2)',
          padding: '20px',
          borderRadius: '10px',
          marginBottom: '20px'
        }}>
          <p>Current CVX staked: <strong>{stakedAmount}</strong></p>
          <p>Reward per activation: <strong>{calculateReward()} TCorvax</strong></p>
          <p>
            <small>
              Stake more CVX to increase your rewards.
              100 CVX = 1 TCorvax, up to 10 TCorvax per activation.
            </small>
          </p>
        </div>
      )}

      <div style={{ width: '100%', height: '400px', overflow: 'hidden' }}>
        <iframe
          title="staking-widget"
          src="https://radix.defiplaza.net/widget/staking/resource_rdx1th04p2c55884yytgj0e8nq79ze9wjnvu4rpg9d7nh3t698cxdt0cr9?theme=green"
          width="100%"
          height="600px"
          style={{
            border: 0,
            margin: '0 auto',
            display: 'block',
            maxWidth: '100%',
            minWidth: '375px',
            colorScheme: 'normal',
            transform: 'scale(0.9)',
            transformOrigin: 'top center',
            marginTop: '-50px'
          }}
          scrolling="no"
        />
      </div>

      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onClose}>Close</button>
        <button
          onClick={handleActivate}
          disabled={
            isLoading ||
            (machine.lastActivated && (Date.now() - machine.lastActivated) < 10000)
          }
        >
          Activate Incubator
        </button>
      </div>
    </div>
  );
};

export default IncubatorWidget;
