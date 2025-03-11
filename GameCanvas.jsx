import { useContext, useEffect, useRef, useState } from 'react';
import { GameContext } from '../context/GameContext';
import IncubatorWidget from './IncubatorWidget';

const GameCanvas = () => {
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const assetsRef = useRef({
    backgroundImage: null,
    playerImage: null,
    catsLairImage: null,
    reactorImage: null,
    amplifierImage: null,
    incubatorImage: null,  // Add incubator image
    loaded: false
  });
  
  const {
    isLoggedIn,
    machines,
    machineTypes,
    particles,
    notifications,
    gridSize,
    activateMachine,
    saveLayout,
    MACHINE_COOLDOWN_MS,
    INTERACTION_RANGE,
    addNotification,
    player,
    setPlayer,
    isRadixConnected,
    handleRadixConnect
  } = useContext(GameContext);
  
  // Keyboard state
  const [keys, setKeys] = useState({});
  
  // Mobile state
  const [isMobile, setIsMobile] = useState(false);
  const [targetX, setTargetX] = useState(player.x);
  const [targetY, setTargetY] = useState(player.y);
  const [autoTargetMachine, setAutoTargetMachine] = useState(null);
  
  // Incubator widget state
  const [showIncubatorWidget, setShowIncubatorWidget] = useState(false);
  const [selectedIncubator, setSelectedIncubator] = useState(null);
  
  // Radix connect state
  const [showRadixConnect, setShowRadixConnect] = useState(false);
  
  // Load assets on mount
  useEffect(() => {
    // Note: These specific paths worked on the original game
    const imageSources = {
      backgroundImage: '/assets/Background.png',
      playerImage: '/assets/Player.png',
      catsLairImage: '/assets/CatsLair.png',
      reactorImage: '/assets/Reactor.png',
      amplifierImage: '/assets/Amplifier.png',
      incubatorImage: '/assets/Incubator.png'  // Add incubator image
    };
    
    const loadImage = (src) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = src;
        img.crossOrigin = "Anonymous"; // Try with this option
        img.onload = () => {
          console.log(`Successfully loaded image: ${src}`);
          resolve(img);
        };
        img.onerror = (err) => {
          console.error(`Failed to load image: ${src}`, err);
          resolve(null); // Resolve with null to continue
        };
      });
    };
    
    const loadAssets = async () => {
      try {
        console.log("Starting to load assets...");
        
        // Load each image and store the result
        const loadedImages = {};
        for (const [key, src] of Object.entries(imageSources)) {
          console.log(`Loading ${key} from ${src}...`);
          loadedImages[key] = await loadImage(src);
        }
        
        // Store in ref
        assetsRef.current = {
          ...loadedImages,
          loaded: true
        };
        
        console.log("All assets loaded successfully:", assetsRef.current);
      } catch (error) {
        console.error('Error loading game assets:', error);
      }
    };
    
    loadAssets();
  }, []);
  
  // Check if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = /Android|iPhone|iPad|iPod|BlackBerry|Opera Mini|IEMobile|WPDesktop/i.test(
        navigator.userAgent
      );
      setIsMobile(isMobileDevice);
    };
    
    checkMobile();
  }, []);
  
  // Set up keyboard listeners
  useEffect(() => {
    const handleKeyDown = (e) => {
      setKeys(prev => ({ ...prev, [e.key]: true }));
      
      // Space bar to activate nearest machine
      if (e.key === ' ') {
        const nearest = findClosestMachineInRange();
        if (nearest) {
          if (nearest.type === 'incubator') {
            handleIncubatorInteraction(nearest);
          } else {
            activateMachine(nearest);
          }
        }
        e.preventDefault();
      }
    };
    
    const handleKeyUp = (e) => {
      setKeys(prev => ({ ...prev, [e.key]: false }));
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [player, machines, activateMachine]);
  
  // Mobile touch handlers
  useEffect(() => {
    if (!isMobile || !canvasRef.current) return;
    
    const handleCanvasTap = (e) => {
      e.preventDefault();
      
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasRef.current.width / rect.width;
      const scaleY = canvasRef.current.height / rect.height;
      
      let tapX, tapY;
      if (e.touches && e.touches.length > 0) {
        tapX = (e.touches[0].clientX - rect.left) * scaleX;
        tapY = (e.touches[0].clientY - rect.top) * scaleY;
      } else {
        tapX = (e.clientX - rect.left) * scaleX;
        tapY = (e.clientY - rect.top) * scaleY;
      }
      
      const tappedMachine = getMachineAtPosition(tapX, tapY);
      
      if (tappedMachine) {
        autoWalkToMachine(tappedMachine);
      } else {
        const playerSize = gridSize * 2;
        setTargetX(tapX - playerSize / 2);
        setTargetY(tapY - playerSize / 2);
        setAutoTargetMachine(null);
      }
    };
    
    canvasRef.current.addEventListener('touchstart', handleCanvasTap, { passive: false });
    canvasRef.current.addEventListener('mousedown', handleCanvasTap);
    
    return () => {
      if (canvasRef.current) {
        canvasRef.current.removeEventListener('touchstart', handleCanvasTap);
        canvasRef.current.removeEventListener('mousedown', handleCanvasTap);
      }
    };
  }, [isMobile, canvasRef, machines, player, gridSize]);
  
  // Helper functions
  const distance = (x1, y1, x2, y2) => {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  };
  
  const getPlayerCenter = () => {
    return {
      px: player.x + player.width / 2,
      py: player.y + player.height / 2
    };
  };
  
  const getMachineCenter = (m) => {
    const half = gridSize;
    return {
      mx: m.x + half,
      my: m.y + half
    };
  };
  
  const isPlayerInRangeOf = (m) => {
    const { px, py } = getPlayerCenter();
    const { mx, my } = getMachineCenter(m);
    return distance(px, py, mx, my) <= INTERACTION_RANGE;
  };
  
  const getMachineAtPosition = (x, y) => {
    const machineSize = gridSize * 2;
    return machines.find(m => {
      return (
        x >= m.x && 
        x < m.x + machineSize && 
        y >= m.y && 
        y < m.y + machineSize
      );
    });
  };
  
  const findClosestMachineInRange = () => {
    const { px, py } = getPlayerCenter();
    let bestMachine = null;
    let bestDist = Infinity;
    
    machines.forEach(m => {
      const { mx, my } = getMachineCenter(m);
      const dist = distance(px, py, mx, my);
      if (dist < bestDist && dist <= INTERACTION_RANGE) {
        bestDist = dist;
        bestMachine = m;
      }
    });
    
    return bestMachine;
  };
  
  // Handle incubator interaction
  const handleIncubatorInteraction = (machine) => {
    if (machine.isOffline && !isRadixConnected) {
      // Show Radix connect widget
      setSelectedIncubator(machine);
      setShowRadixConnect(true);
    } else {
      // Show incubator widget
      setSelectedIncubator(machine);
      setShowIncubatorWidget(true);
    }
  };
  
  const autoWalkToMachine = (machine) => {
    const { px, py } = getPlayerCenter();
    const { mx, my } = getMachineCenter(machine);
    const dist = distance(px, py, mx, my);
    
    if (dist <= INTERACTION_RANGE) {
      if (machine.type === 'incubator') {
        handleIncubatorInteraction(machine);
      } else {
        activateMachine(machine);
      }
    } else {
      const offset = gridSize;
      setTargetX(mx - offset);
      setTargetY(my - offset);
      setAutoTargetMachine(machine);
    }
  };
  
  // Move player based on keyboard/touch input
  const movePlayer = () => {
    let newPlayer = { ...player };
    
    // Keyboard movement
    if (keys.ArrowUp) newPlayer.velocityY -= newPlayer.acceleration;
    if (keys.ArrowDown) newPlayer.velocityY += newPlayer.acceleration;
    if (keys.ArrowLeft) {
      newPlayer.velocityX -= newPlayer.acceleration;
      newPlayer.facingRight = false;
    }
    if (keys.ArrowRight) {
      newPlayer.velocityX += newPlayer.acceleration;
      newPlayer.facingRight = true;
    }
    
    // Mobile auto-walk
    if (!keys.ArrowUp && !keys.ArrowDown && !keys.ArrowLeft && !keys.ArrowRight && isMobile) {
      const dx = targetX - newPlayer.x;
      const dy = targetY - newPlayer.y;
      const distVal = distance(newPlayer.x, newPlayer.y, targetX, targetY);
      
      if (distVal > 1) {
        const step = Math.min(newPlayer.maxSpeed, distVal);
        newPlayer.x += (dx / distVal) * step;
        newPlayer.y += (dy / distVal) * step;
        
        // Update facing direction based on movement
        if (dx !== 0) {
          newPlayer.facingRight = dx > 0;
        }
      } else if (autoTargetMachine) {
        if (isPlayerInRangeOf(autoTargetMachine)) {
          if (autoTargetMachine.type === 'incubator') {
            handleIncubatorInteraction(autoTargetMachine);
          } else {
            activateMachine(autoTargetMachine);
          }
        }
        setAutoTargetMachine(null);
      }
    } else {
      // Clamp speed
      newPlayer.velocityX = Math.max(-newPlayer.maxSpeed, Math.min(newPlayer.maxSpeed, newPlayer.velocityX));
      newPlayer.velocityY = Math.max(-newPlayer.maxSpeed, Math.min(newPlayer.maxSpeed, newPlayer.velocityY));
      
      // Apply friction
      newPlayer.velocityX *= newPlayer.friction;
      newPlayer.velocityY *= newPlayer.friction;
      
      // Update position with bounds checking
      newPlayer.x = Math.max(0, Math.min(800 - newPlayer.width, newPlayer.x + newPlayer.velocityX));
      newPlayer.y = Math.max(0, Math.min(600 - newPlayer.height, newPlayer.y + newPlayer.velocityY));
    }
    
    setPlayer(newPlayer);
  };
  
  // Handle Radix wallet connection
  const onRadixConnect = (walletData) => {
    handleRadixConnect(walletData);
    setShowRadixConnect(false);
    
    // Check if there's a selected incubator to activate
    if (selectedIncubator && selectedIncubator.isOffline) {
      activateMachine(selectedIncubator);
    }
  };
  
  // Game loop
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const ctx = canvasRef.current.getContext('2d');
    
    const gameLoop = () => {
      // Check if the canvas still exists
      if (!canvasRef.current) {
        return;
      }
      
      // Get the context again for safety
      const ctx = canvasRef.current.getContext('2d');
      
      // Clear canvas
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      
      // Draw background
      drawBackground(ctx);
      
      // Draw machines
      drawMachines(ctx);
      
      // Draw player
      drawPlayer(ctx);
      
      // Draw particles and notifications
      drawParticlesAndNotifications(ctx);
      
      // Move player
      movePlayer();
      
      // Request next frame
      requestRef.current = requestAnimationFrame(gameLoop);
    };
    
    // Start the game loop
    requestRef.current = requestAnimationFrame(gameLoop);
    
    // Clean up
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    };
  }, [
    player,
    machines,
    particles,
    notifications,
    keys,
    targetX,
    targetY,
    autoTargetMachine,
    isLoggedIn,
    isRadixConnected
  ]);
  
  // Draw functions
  const drawBackground = (ctx) => {
    if (assetsRef.current.backgroundImage) {
      try {
        ctx.drawImage(
          assetsRef.current.backgroundImage, 
          0, 
          0, 
          canvasRef.current.width, 
          canvasRef.current.height
        );
      } catch (error) {
        console.error("Error drawing background:", error);
        // Fallback background
        drawFallbackBackground(ctx);
      }
    } else {
      // Fallback background
      drawFallbackBackground(ctx);
    }
  };
  
  const drawFallbackBackground = (ctx) => {
    // Draw a blue-tinted grid similar to the original
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    // Grid pattern for visual reference - make it bluish like the original
    ctx.strokeStyle = '#5555aa';
    
    // Draw vertical grid lines
    for (let x = 0; x < canvasRef.current.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasRef.current.height);
      ctx.stroke();
    }
    
    // Draw horizontal grid lines
    for (let y = 0; y < canvasRef.current.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasRef.current.width, y);
      ctx.stroke();
    }
  };
  
  const drawPlayer = (ctx) => {
    if (!player) return;
    
    ctx.save();
    
    try {
      if (assetsRef.current.playerImage) {
        if (player.facingRight) {
          ctx.translate(player.x + player.width, player.y);
          ctx.scale(-1, 1);
          ctx.drawImage(assetsRef.current.playerImage, 0, 0, player.width, player.height);
        } else {
          ctx.drawImage(assetsRef.current.playerImage, player.x, player.y, player.width, player.height);
        }
      } else {
        // Fallback player representation - make it green like in the original
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(player.x, player.y, player.width, player.height);
        
        // Add eyes to make it look like a character
        ctx.fillStyle = '#fff';
        const eyeSize = 8;
        const eyeY = player.y + player.height / 3;
        
        if (player.facingRight) {
          ctx.fillRect(player.x + player.width - 25, eyeY, eyeSize, eyeSize); 
          ctx.fillRect(player.x + player.width - 45, eyeY, eyeSize, eyeSize);
        } else {
          ctx.fillRect(player.x + 20, eyeY, eyeSize, eyeSize);
          ctx.fillRect(player.x + 40, eyeY, eyeSize, eyeSize);
        }
      }
    } catch (error) {
      console.error("Error drawing player:", error);
      // Fallback if there's an error
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(player.x, player.y, player.width, player.height);
    }
    
    ctx.restore();
  };
  
  const drawMachines = (ctx) => {
    if (!machines || machines.length === 0) return;
    
    const machineSize = gridSize * 2;
    
    machines.forEach(m => {
      // Select the right image based on machine type
      let img = null;
      
      if (m.type === 'catLair' && assetsRef.current.catsLairImage) {
        img = assetsRef.current.catsLairImage;
      } else if (m.type === 'reactor' && assetsRef.current.reactorImage) {
        img = assetsRef.current.reactorImage;
      } else if (m.type === 'amplifier' && assetsRef.current.amplifierImage) {
        img = assetsRef.current.amplifierImage;
      } else if (m.type === 'incubator' && assetsRef.current.incubatorImage) {
        img = assetsRef.current.incubatorImage;
      }
      
      try {
        // Draw machine image or fallback
        if (img) {
          ctx.drawImage(img, m.x, m.y, machineSize, machineSize);
        } else {
          // Fallback colored rectangle if image not loaded
          const color = machineTypes[m.type]?.baseColor || '#555';
          ctx.fillStyle = color;
          ctx.fillRect(m.x, m.y, machineSize, machineSize);
          
          // Add text label for machine type
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 14px Orbitron';
          ctx.textAlign = 'center';
          ctx.fillText(m.type, m.x + machineSize/2, m.y + machineSize/2);
        }
      } catch (error) {
        console.error(`Error drawing machine ${m.type}:`, error);
        // Fallback in case of error
        const color = machineTypes[m.type]?.baseColor || '#555';
        ctx.fillStyle = color;
        ctx.fillRect(m.x, m.y, machineSize, machineSize);
      }
      
      // Draw level label - make it more similar to the original with green background
      ctx.save();
      const labelText = `Lvl ${m.level}`;
      const labelWidth = 60;
      const labelHeight = 18;
      const labelX = m.x + machineSize / 2 - labelWidth / 2;
      const labelY = m.y - labelHeight - 2;
      
      // Use machine-specific color for level background
      const labelColor = machineTypes[m.type]?.baseColor || '#45a049';
      ctx.fillStyle = labelColor;
      ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
      
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Orbitron';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, labelX + labelWidth / 2, labelY + labelHeight / 2);
      ctx.restore();
      
      // Draw cooldown bar for catLair/reactor/incubator
      if (m.type !== 'amplifier') {
        const elapsed = Date.now() - (m.lastActivated || 0);
        const cdProgress = Math.max(0, 1 - elapsed / MACHINE_COOLDOWN_MS);
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(m.x, m.y + machineSize - 8, machineSize, 6);
        
        const gradient = ctx.createLinearGradient(
          m.x,
          m.y + machineSize - 8,
          m.x + machineSize * cdProgress,
          m.y + machineSize - 8
        );
        gradient.addColorStop(0, machineTypes[m.type]?.levelColors[m.level] || '#4CAF50');
        gradient.addColorStop(1, '#fff');
        ctx.fillStyle = gradient;
        ctx.fillRect(m.x, m.y + machineSize - 8, machineSize * cdProgress, 6);
      }
      
      // If amplifier is offline => show OFFLINE
      if (m.type === 'amplifier' && m.isOffline) {
        ctx.save();
        const offText = 'OFFLINE';
        const offWidth = 60;
        const offHeight = 18;
        const offX = m.x + machineSize / 2 - offWidth / 2;
        const offY = m.y + machineSize + 2;
        ctx.fillStyle = '#c62828';
        ctx.fillRect(offX, offY, offWidth, offHeight);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(offText, offX + offWidth / 2, offY + offHeight / 2);
        ctx.restore();
      }
      
      // If incubator is offline => show CONNECT WALLET
      if (m.type === 'incubator' && m.isOffline) {
        ctx.save();
        const offText = 'CONNECT WALLET';
        const offWidth = 120;
        const offHeight = 18;
        const offX = m.x + machineSize / 2 - offWidth / 2;
        const offY = m.y + machineSize + 2;
        ctx.fillStyle = '#FF5722';
        ctx.fillRect(offX, offY, offWidth, offHeight);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(offText, offX + offWidth / 2, offY + offHeight / 2);
        ctx.restore();
      }
    });
  };
  
  const drawParticlesAndNotifications = (ctx) => {
    // Draw particles
    particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    
    // Draw notifications
    notifications.forEach(n => {
      ctx.globalAlpha = n.life;
      ctx.font = 'bold 16px Orbitron';
      ctx.textAlign = 'center';
      const textWidth = ctx.measureText(n.text).width;
      const textHeight = 16;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(
        n.x - textWidth / 2 - 8,
        n.y - textHeight - 4,
        textWidth + 16,
        textHeight + 8
      );
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, n.x, n.y);
      ctx.globalAlpha = 1;
    });
  };
  
  return (
    <>
      <canvas 
        ref={canvasRef} 
        id="gameCanvas" 
        width={800} 
        height={600}
        style={{ 
          borderRadius: '0 10px 10px 0',
          boxShadow: '0 0 30px rgba(76, 175, 80, 0.2)',
          transition: 'box-shadow 0.3s ease',
          display: isLoggedIn ? 'block' : 'none'
        }}
      />
      
      {/* Incubator Widget */}
      {showIncubatorWidget && selectedIncubator && (
        <IncubatorWidget 
          machineId={selectedIncubator.id} 
          onClose={() => setShowIncubatorWidget(false)} 
        />
      )}
      
      {/* Radix Connect Widget */}
      {showRadixConnect && (
        <div className="welcome-message">
          <h1>Connect Radix Wallet</h1>
          <p>You need to connect your Radix wallet to activate the Incubator.</p>
          <button 
            onClick={() => {
              setShowRadixConnect(false);
              setSelectedIncubator(null);
            }}
            style={{ marginTop: '20px' }}
          >
            Cancel
          </button>
        </div>
      )}
    </>
  );
};

export default GameCanvas;
