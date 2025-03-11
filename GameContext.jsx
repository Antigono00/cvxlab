import React, { createContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  RadixDappToolkit,
  RadixNetwork,
  DataRequestBuilder
} from '@radixdlt/radix-dapp-toolkit';
import { GatewayApiClient } from '@radixdlt/babylon-gateway-api-sdk';

export const GameContext = createContext();

/**************************************************************
 * Machine definitions + constants
 **************************************************************/
const machineTypes = {
  catLair: {
    name: "Cat's Lair",
    baseCost: { tcorvax: 10 },
    production: { catNips: 5 },
    cooldown: 10 * 1000,
    baseColor: "#4CAF50",
    levelColors: {
      1: "#4CAF50",
      2: "#2196F3",
      3: "#00E676",
    },
    particleColor: "#a5d6a7",
  },
  reactor: {
    name: "Reactor",
    baseCost: { tcorvax: 10, catNips: 10 },
    production: { tcorvax: 1, energy: 2 },
    cooldown: 10 * 1000,
    baseColor: "#2196F3",
    levelColors: {
      1: "#2196F3",
      2: "#1976D2",
      3: "#00C853",
    },
    particleColor: "#90caf9",
  },
  amplifier: {
    name: "Amplifier",
    baseCost: { tcorvax: 10, catNips: 10, energy: 10 },
    boost: { tcorvax: 0.5, energy: 0 },
    baseColor: "#9C27B0",
    levelColors: {
      1: "#9C27B0",
      2: "#7B1FA2",
      3: "#00BFA5",
      4: "#00FF00",
      5: "#FFD700",
    },
    particleColor: "#ce93d8",
  },
  incubator: {
    name: "Incubator",
    baseCost: { tcorvax: 320, catNips: 320, energy: 320 },
    production: { tcorvax: 0 },
    cooldown: 10 * 1000,
    baseColor: "#FF5722",
    levelColors: {
      1: "#FF5722",
    },
    particleColor: "#FFCCBC",
  },
};

const MAX_LEVEL = 3;
const AMPLIFIER_MAX_LEVEL = 5;
const MACHINE_COOLDOWN_MS = 10 * 1000;
const gridSize = 64;
const INTERACTION_RANGE = gridSize * 1.5;

// Debug logs for clarity
console.log('=== Using Radix DApp Toolkit v2.2.1 ===');
console.log('=== Using Gateway API v1.10.1 ===');

export const GameProvider = ({ children }) => {
  // Telegram login state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');

  // Radix wallet states
  const [rdt, setRdt] = useState(null);
  const [gatewayApi, setGatewayApi] = useState(null);
  const [isRadixConnected, setIsRadixConnected] = useState(false);
  const [radixWalletData, setRadixWalletData] = useState(null);

  // Game resources
  const [tcorvax, setTcorvax] = useState(300.0);
  const [catNips, setCatNips] = useState(300.0);
  const [energy, setEnergy] = useState(300.0);

  // Machines
  const [machines, setMachines] = useState([]);
  const [machineCount, setMachineCount] = useState({
    catLair: 0,
    reactor: 0,
    amplifier: 0,
    incubator: 0,
  });

  // Player
  const [player, setPlayer] = useState({
    x: 400 - gridSize,
    y: 300 - gridSize,
    width: gridSize * 2,
    height: gridSize * 2,
    velocityX: 0,
    velocityY: 0,
    maxSpeed: 4,
    acceleration: 0.5,
    friction: 0.85,
    facingRight: false
  });

  // UI states
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(true);
  const [showLowCorvaxMessage, setShowLowCorvaxMessage] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [particles, setParticles] = useState([]);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  /**************************************************************
   * 1) Initialize the RadixDappToolkit + Gateway
   **************************************************************/
  useEffect(() => {
    if (rdt) return; // only initialize once

    console.log("Initializing RadixDappToolkit...");

    const dAppToolkit = RadixDappToolkit(
      {
        // Replace with your real dApp definition address
        dAppDefinitionAddress: 'account_rdx129994zq674n4mturvkqz7cz9t7gmtn5sjspxv7py2ahqnpdvxjsqum',
        networkId: RadixNetwork.Mainnet,
        applicationName: 'Corvax Lab',
        applicationVersion: '1.0.0',
      },
      // request data callback
      (requestData) => {
        // **Request at least one account** so the user can share their address
        requestData(
          DataRequestBuilder.accounts().atLeast(1)
        );
      },
      {
        onConnect: ({ accounts }) => {
          console.log("onConnect callback => accounts:", accounts);
          if (accounts && accounts.length > 0) {
            setIsRadixConnected(true);
            // We won't store the entire accounts here, 
            // because we'll rely on the walletData$ subscription for more updates
          }
        },
        onDisconnect: () => {
          console.log("Wallet disconnected via onDisconnect");
          setIsRadixConnected(false);
          setRadixWalletData(null);
        },
      }
    );

    setRdt(dAppToolkit);

    // Now create a Gateway client to query ledger if needed
    const client = new GatewayApiClient({
      baseURL: 'https://mainnet-gateway.radixdlt.com'
    });
    setGatewayApi(client);

    // Subscribe to walletData => for accounts, persona, etc.
    const subscription = dAppToolkit.walletApi.walletData$.subscribe({
      next: (walletData) => {
        console.log("walletData$.subscribe =>", walletData);
        if (walletData.accounts && walletData.accounts.length > 0) {
          setIsRadixConnected(true);
          setRadixWalletData(walletData);
        } else {
          // no accounts => user hasn't shared or removed them
          setIsRadixConnected(false);
          setRadixWalletData(null);
        }
      },
      error: (err) => {
        console.error("walletData$ error =>", err);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [rdt]);

  /**************************************************************
   * 2) getStakedCvxBalance => checks user staked CVX
   **************************************************************/
  const getStakedCvxBalance = async () => {
    if (!isRadixConnected || !gatewayApi || !radixWalletData) return 0;
    const accounts = radixWalletData.accounts;
    if (!accounts || accounts.length === 0) return 0;

    const userAccount = accounts[0]; // take the first shared account
    try {
      console.log("DEBUG => calling gatewayApi.getEntityFungibleResources...");
      const response = await gatewayApi.getEntityFungibleResources({
        address: userAccount.address
      });
      console.log("DEBUG => gatewayApi response:", response);

      if (!response || !response.items) {
        console.warn("No 'items' in response => returning 0");
        return 0;
      }
      // Replace with your real staked CVX resource address
      const sCvxResourceAddress = 'resource_rdx1t5q4aa74uxcgzehk0u3hjy6kng9rqyr4uvktnud8ehdqaaez50n693';
      const found = response.items.find(f => f.resourceAddress === sCvxResourceAddress);
      const balance = found ? parseFloat(found.amount) : 0;
      console.log("DEBUG => staked CVX =>", balance);
      return balance;
    } catch (err) {
      console.error('Error fetching staked CVX =>', err);
      return 0;
    }
  };

  /**************************************************************
   * 3) Telegram login + loadGameFromServer
   **************************************************************/
  const checkLoginStatus = useCallback(async () => {
    try {
      const resp = await axios.get('/api/whoami');
      if (resp.data.loggedIn) {
        setIsLoggedIn(true);
        setUserName(resp.data.firstName || 'Player');
        await loadGameFromServer();
      }
    } catch (error) {
      console.error('Error checking login status:', error);
    }
  }, []);

  const loadGameFromServer = useCallback(async () => {
    try {
      const resp = await axios.get('/api/getGameState');
      setTcorvax(parseFloat(resp.data.tcorvax));
      setCatNips(parseFloat(resp.data.catNips));
      setEnergy(parseFloat(resp.data.energy));

      const newMachines = resp.data.machines.map(m => ({
        ...m,
        particleColor: machineTypes[m.type]?.particleColor
      }));
      setMachines(newMachines);

      // Count machines
      const counts = { catLair: 0, reactor: 0, amplifier: 0, incubator: 0 };
      newMachines.forEach(m => {
        counts[m.type] = (counts[m.type] || 0) + 1;
      });
      setMachineCount(counts);

      setShowLowCorvaxMessage(resp.data.tcorvax < 20 && counts.reactor === 0);
    } catch (error) {
      console.error('Error loading game state:', error);
    }
  }, []);

  /**************************************************************
   * 4) Utility / helper methods
   **************************************************************/
  const formatResource = (val) => {
    if (!val) return "0.0";
    return val.toFixed(1);
  };

  const canAfford = (cost) => {
    return (
      (!cost.tcorvax || tcorvax >= cost.tcorvax) &&
      (!cost.catNips || catNips >= cost.catNips) &&
      (!cost.energy || energy >= cost.energy)
    );
  };

  const calculateMachineCost = (type) => {
    const base = machineTypes[type]?.baseCost || {};
    const builtCount = machineCount[type] || 0;
    // second catLair/reactor => x4
    if ((type === "catLair" || type === "reactor") && builtCount === 1) {
      const multiplied = {};
      for (const k in base) {
        multiplied[k] = base[k] * 4;
      }
      return multiplied;
    }
    return { ...base };
  };

  const canBuildMachine = (type) => {
    const builtCount = machineCount[type] || 0;
    if (type === "catLair" || type === "reactor") {
      if (builtCount >= 2) return false;
    } else if (type === "amplifier" || type === "incubator") {
      if (builtCount >= 1) return false;
    }
    const cost = calculateMachineCost(type);
    return canAfford(cost);
  };

  /**************************************************************
   * 5) UI => notifications + particles
   **************************************************************/
  const addNotification = (text, x, y, color) => {
    setNotifications(prev => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        text,
        x,
        y,
        color,
        life: 3.0
      }
    ]);
  };

  const addParticles = (x, y, color, count = 20) => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        id: Date.now() + i,
        x,
        y,
        color,
        size: Math.random() * 3 + 2,
        speedX: (Math.random() - 0.5) * 3,
        speedY: (Math.random() - 0.5) * 3,
        life: 1.0
      });
    }
    setParticles(prev => [...prev, ...arr]);
  };

  /**************************************************************
   * 6) Build / Upgrade / Activate / Save
   **************************************************************/
  const buildMachine = async (type, x, y) => {
    try {
      const resp = await axios.post('/api/buildMachine', { machineType: type, x, y });
      setTcorvax(parseFloat(resp.data.newResources.tcorvax));
      setCatNips(parseFloat(resp.data.newResources.catNips));
      setEnergy(parseFloat(resp.data.newResources.energy));

      await loadGameFromServer();
      addNotification(`Built ${type}!`, x + gridSize / 2, y - 20, "#4CAF50");
      addParticles(x + gridSize, y + gridSize, machineTypes[type].particleColor || "#fff");
    } catch (error) {
      console.error('Error building machine:', error);
      addNotification(
        error.response?.data?.error || "Build error!",
        x + gridSize / 2,
        y - 20,
        "#ff4444"
      );
    }
  };

  const upgradeMachine = async (machineId) => {
    try {
      const resp = await axios.post('/api/upgradeMachine', { machineId });
      setTcorvax(parseFloat(resp.data.newResources.tcorvax));
      setCatNips(parseFloat(resp.data.newResources.catNips));
      setEnergy(parseFloat(resp.data.newResources.energy));

      const machine = machines.find(m => m.id === machineId);
      if (machine) {
        addParticles(machine.x + gridSize, machine.y + gridSize, "#FFD700", 30);
        addNotification(
          `Level Up => ${resp.data.newLevel}`,
          machine.x + gridSize,
          machine.y - 20,
          "#FFD700"
        );
      }
      await loadGameFromServer();
    } catch (error) {
      console.error('Error upgrading machine:', error);
      addNotification(
        error.response?.data?.error || "Upgrade error!",
        0, 0,
        "#ff4444"
      );
    }
  };

  const activateMachine = async (machine) => {
    if (!machine) return;

    // If incubator => need wallet connected + shared account
    if (machine.type === "incubator") {
      if (!isRadixConnected || !(radixWalletData?.accounts?.length > 0)) {
        addNotification(
          "Connect Radix wallet first!",
          machine.x + gridSize,
          machine.y - 20,
          "#FF5722"
        );
        return;
      }
    }

    try {
      // For incubator => get staked CVX
      let stakedCvxVal = 0;
      if (machine.type === "incubator" && !machine.isOffline) {
        stakedCvxVal = await getStakedCvxBalance();
      }

      const resp = await axios.post('/api/activateMachine', {
        machineId: machine.id,
        stakedCvx: stakedCvxVal
      });

      if (resp.data.message) {
        addNotification(
          resp.data.message,
          machine.x + gridSize,
          machine.y - 20,
          resp.data.message === "Offline" ? "#ff4444" : "#4CAF50"
        );
      }

      if (resp.data.updatedResources) {
        const oldTcorvax = tcorvax;
        const oldCatNips = catNips;
        const oldEnergy = energy;
        const newTcorvax = parseFloat(resp.data.updatedResources.tcorvax);
        const newCatNips = parseFloat(resp.data.updatedResources.catNips);
        const newEnergy = parseFloat(resp.data.updatedResources.energy);

        setTcorvax(newTcorvax);
        setCatNips(newCatNips);
        setEnergy(newEnergy);

        if (machine.type === "catLair") {
          const gainedCN = newCatNips - oldCatNips;
          addNotification(
            `+${formatResource(gainedCN)} Cat Nips`,
            machine.x + gridSize,
            machine.y,
            "#ffa500"
          );
        } else if (machine.type === "reactor") {
          const gainedTC = newTcorvax - oldTcorvax;
          const gainedEN = newEnergy - oldEnergy;
          addNotification(
            `+${formatResource(gainedTC)} TCorvax`,
            machine.x + gridSize,
            machine.y - 10,
            "#4CAF50"
          );
          addNotification(
            `+${formatResource(gainedEN)} Energy`,
            machine.x + gridSize,
            machine.y + 10,
            "#FFD700"
          );
        } else if (machine.type === "incubator") {
          const reward = resp.data.reward || 0;
          if (reward > 0) {
            addNotification(
              `+${reward} TCorvax`,
              machine.x + gridSize,
              machine.y - 10,
              "#FF5722"
            );
          } else if (resp.data.message === "Incubator Online") {
            addNotification(
              "Incubator Online",
              machine.x + gridSize,
              machine.y - 10,
              "#4CAF50"
            );
          }
        }
      }

      if (resp.data.newLastActivated !== undefined) {
        setMachines(prev =>
          prev.map(m =>
            m.id === machine.id
              ? {
                  ...m,
                  lastActivated: resp.data.newLastActivated,
                  isOffline: (machine.type === "incubator" && resp.data.message === "Incubator Online")
                    ? false
                    : m.isOffline
                }
              : m
          )
        );
      }

      addParticles(
        machine.x + gridSize,
        machine.y + gridSize,
        machine.particleColor || "#fff"
      );
      setShowLowCorvaxMessage(tcorvax < 20 && machineCount.reactor === 0);
    } catch (error) {
      console.error('Error activating machine:', error);
      if (error.response?.data?.remainingMs) {
        const remainMins = Math.ceil(error.response.data.remainingMs / 60000);
        addNotification(
          `Cooldown! Wait ${remainMins} min.`,
          machine.x + gridSize,
          machine.y - 20,
          "#ff4444"
        );
      } else {
        addNotification(
          error.response?.data?.error || "Cannot activate",
          machine.x + gridSize,
          machine.y - 20,
          "#ff4444"
        );
      }
    }
  };

  const saveLayout = async (positions) => {
    try {
      await axios.post('/api/syncLayout', {
        machines: positions.map(m => ({
          id: m.id,
          x: m.x,
          y: m.y
        }))
      });
    } catch (error) {
      console.error('Error saving layout:', error);
    }
  };

  /**************************************************************
   * 7) On mount => check Telegram session
   **************************************************************/
  useEffect(() => {
    checkLoginStatus();
  }, [checkLoginStatus]);

  /**************************************************************
   * 8) Detect mobile
   **************************************************************/
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = /Android|iPhone|iPad|iPod|BlackBerry|Opera Mini|IEMobile|WPDesktop/i.test(
        navigator.userAgent
      );
      setIsMobile(isMobileDevice);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  /**************************************************************
   * 9) Update animations for notifications + particles
   **************************************************************/
  useEffect(() => {
    const updateAnimations = () => {
      setParticles(prev =>
        prev.map(p => ({
          ...p,
          x: p.x + p.speedX,
          y: p.y + p.speedY,
          life: p.life - 0.01,
          size: p.size * 0.99
        })).filter(p => p.life > 0)
      );

      setNotifications(prev =>
        prev.map(n => ({
          ...n,
          y: n.y - 0.3,
          life: n.life - 0.01
        })).filter(n => n.life > 0)
      );
    };
    const interval = setInterval(updateAnimations, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <GameContext.Provider
      value={{
        // Telegram
        isLoggedIn,
        userName,

        // Resources
        tcorvax,
        catNips,
        energy,
        machines,
        machineCount,
        player,

        // UI
        showWelcomeMessage,
        setShowWelcomeMessage,
        showLowCorvaxMessage,
        setShowLowCorvaxMessage,
        isPanelOpen,
        setIsPanelOpen,
        notifications,
        particles,
        assetsLoaded,
        setAssetsLoaded,
        isMobile,

        // Machine info
        machineTypes,
        gridSize,
        INTERACTION_RANGE,
        MACHINE_COOLDOWN_MS,

        // Main functionalities
        loadGameFromServer,
        buildMachine,
        upgradeMachine,
        activateMachine,
        saveLayout,
        addNotification,
        addParticles,
        setPlayer,

        // Helpers
        canBuildMachine,
        canAfford,
        calculateMachineCost,
        formatResource,

        // Radix wallet states
        rdt, // optional if you need direct access
        gatewayApi,
        isRadixConnected,
        radixWalletData,
        getStakedCvxBalance
      }}
    >
      {children}
    </GameContext.Provider>
  );
};
