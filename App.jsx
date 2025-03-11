import { useContext, useEffect } from 'react';
import { GameContext } from './context/GameContext';
import TelegramLogin from './components/TelegramLogin';
import GameCanvas from './components/GameCanvas';
import SidePanel from './components/SidePanel';
import MobileMenu from './components/MobileMenu';
import WelcomeMessage from './components/WelcomeMessage';
import LowCorvaxMessage from './components/LowCorvaxMessage';

function App() {
  const {
    isLoggedIn,
    showWelcomeMessage,
    isPanelOpen,
    setIsPanelOpen,
    loadGameFromServer,
    setAssetsLoaded,
    isMobile
  } = useContext(GameContext);

  // Preload images
  useEffect(() => {
    const imagePaths = [
      '/assets/Background.png',
      '/assets/Player.png',
      '/assets/CatsLair.png',
      '/assets/Reactor.png',
      '/assets/Amplifier.png',
      '/assets/Incubator.png'
    ];
    console.log("Starting to load assets...");

    const preloadImages = async () => {
      try {
        for (const src of imagePaths) {
          console.log(`Loading image from ${src}...`);
          await new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
              console.log(`Successfully loaded image: ${src}`);
              resolve(true);
            };
            img.onerror = () => {
              console.warn(`Failed to load image: ${src}`);
              resolve(true);
            };
            img.src = src;
          });
        }
        console.log("All images have been attempted to load.");
      } catch (err) {
        console.error("Preloading error:", err);
      }
      setAssetsLoaded(true);
    };
    preloadImages();
  }, [setAssetsLoaded]);

  // Load game data once user is logged in (Telegram side)
  useEffect(() => {
    if (isLoggedIn) {
      loadGameFromServer();
    }
  }, [isLoggedIn, loadGameFromServer]);

  return (
    <div className="app-container">
      {!isLoggedIn && <TelegramLogin />}

      {isLoggedIn && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 2000,
            backgroundColor: 'rgba(30, 30, 30, 0.8)',
            padding: '10px',
            borderRadius: '10px',
            boxShadow: '0 0 15px rgba(76, 175, 80, 0.3)',
            backdropFilter: 'blur(5px)'
          }}
        >
          {/* Official Radix DApp Toolkit connect button */}
          <radix-connect-button></radix-connect-button>
        </div>
      )}

      <MobileMenu isOpen={isPanelOpen} setIsOpen={setIsPanelOpen} />

      <div className={`game-container ${isMobile ? 'mobile' : ''}`}>
        <SidePanel isOpen={isPanelOpen || !isMobile} />
        <GameCanvas />
      </div>

      {showWelcomeMessage && <WelcomeMessage />}
      <LowCorvaxMessage />

      {isLoggedIn && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 2000,
            backgroundColor: 'rgba(30, 30, 30, 0.8)',
            padding: '10px',
            borderRadius: '10px',
            boxShadow: '0 0 15px rgba(76, 175, 80, 0.3)'
          }}
        >
          <p style={{ color: 'white', textAlign: 'center', marginBottom: '10px' }}>
            Backup
          </p>
          <radix-connect-button></radix-connect-button>
        </div>
      )}
    </div>
  );
}

export default App;
