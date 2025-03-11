import { useContext } from 'react';
import { GameContext } from '../context/GameContext';

const WelcomeMessage = () => {
  const { setShowWelcomeMessage } = useContext(GameContext);
  
  return (
    <div className="welcome-message">
      <h1>Welcome to Corvax Lab!</h1>
      <p>Earn more <strong>TCorvax</strong> by managing your Lab machines:</p>
      <ul>
        <li><strong style={{ color: '#4CAF50' }}>Cat's Lair</strong> produces Cat Nips. Use them to power other machines.</li>
        <li>
          <strong style={{ color: '#2196F3' }}>Reactor</strong> consumes a few Cat Nips each activation and generates TCorvax and Energy.
        </li>
        <li>
          <strong style={{ color: '#9C27B0' }}>Amplifier</strong> boosts the TCorvax production of your Reactor. But it needs <em>Energy</em> every day to stay online. If there's not enough Energy it goes offline until you can pay again.
        </li>
        <li>
          <strong style={{ color: '#FF5722' }}>Incubator</strong> can be built once you've maxed out all other machines. Connect your Radix wallet to start earning TCorvax based on your staked CVX.
        </li>
        <li>All machines have a 1-hour cooldown before you can activate them again.</li>
      </ul>
      <p>
        <strong>Desktop:</strong> Use <span className="key">↑</span><span className="key">↓</span><span className="key">←</span><span className="key">→</span> to move, press <span className="key">Space</span> to activate.
        <br/>
        <strong>Mobile:</strong> Tap the screen to move, or tap a machine to approach &amp; activate. Use the ≡ Menu to build/upgrade.
      </p>
      <p>Get enough TCorvax to build your first <strong style={{ color: '#4CAF50' }}>Cat's Lair</strong> and then a <strong style={{ color: '#2196F3' }}>Reactor</strong>. Good luck!</p>
      <button onClick={() => setShowWelcomeMessage(false)}>Start Playing</button>
    </div>
  );
};

export default WelcomeMessage;
