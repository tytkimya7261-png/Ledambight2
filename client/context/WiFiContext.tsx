import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from "react";
import { Platform, PermissionsAndroid } from "react-native";

export interface WiFiDevice {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  rssi?: number;
  isConnected: boolean;
}

interface WiFiContextType {
  devices: WiFiDevice[];
  connectedDevice: WiFiDevice | null;
  isScanning: boolean;
  isWiFiEnabled: boolean;
  startScan: () => void;
  stopScan: () => void;
  connectDevice: (device: WiFiDevice) => Promise<void>;
  disconnectDevice: () => void;
  sendColor: (color: string) => void;
  sendRegionColors: (colors: { top: string; right: string; bottom: string; left: string }) => void;
}

const WiFiContext = createContext<WiFiContextType | undefined>(undefined);

// ESP cihazları için standart UDP portu
const ESP_UDP_PORT = 7777;
const BROADCAST_PORT = 7778;

// Mock cihazlar (web için)
const MOCK_DEVICES: WiFiDevice[] = [
  {
    id: "mock-1",
    name: "ESP LED Test (Mock)",
    ipAddress: "192.168.1.100",
    port: ESP_UDP_PORT,
    rssi: -45,
    isConnected: false,
  },
  {
    id: "mock-2",
    name: "ESP LED Living Room (Mock)",
    ipAddress: "192.168.1.101",
    port: ESP_UDP_PORT,
    rssi: -62,
    isConnected: false,
  },
];

export function WiFiProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<WiFiDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<WiFiDevice | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isWiFiEnabled, setIsWiFiEnabled] = useState(true);
  const [udpSocket, setUdpSocket] = useState<any>(null);
  const seqRef = useRef<number>(0);
  const lastRegionsRef = useRef<string[]>(['', '', '', '']);

  useEffect(() => {
    checkWiFiStatus();
  }, []);

  const checkWiFiStatus = useCallback(async () => {
    if (Platform.OS === 'web') {
      setIsWiFiEnabled(true);
      return;
    }

    try {
      const WifiManager = require("react-native-wifi-reborn").default;
      if (WifiManager && typeof WifiManager.isEnabled === 'function') {
        const enabled = await WifiManager.isEnabled();
        setIsWiFiEnabled(enabled);
      } else {
        setIsWiFiEnabled(false);
      }
    } catch (error) {
      console.error("WiFi status check error:", error);
      setIsWiFiEnabled(false);
    }
  }, []);

  const requestWiFiPermissions = async () => {
    if (Platform.OS === "android") {
      try {
        const permissions = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);

        return (
          permissions["android.permission.ACCESS_FINE_LOCATION"] === PermissionsAndroid.RESULTS.GRANTED &&
          permissions["android.permission.ACCESS_COARSE_LOCATION"] === PermissionsAndroid.RESULTS.GRANTED
        );
      } catch (error) {
        console.error("Permission error:", error);
        return false;
      }
    }
    return true;
  };

  const hexToRgbBytes = (hex: string): number[] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return [0, 0, 0];
    return [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16),
    ];
  };

  const startScan = useCallback(async () => {
    console.log('startScan çağrıldı');

    // Web için mock cihazlar
    if (Platform.OS === 'web') {
      setIsScanning(true);
      setDevices([]);

      setTimeout(() => {
        console.log('Mock cihazlar yükleniyor...');
        setDevices(MOCK_DEVICES);
        setIsScanning(false);
      }, 1500);

      return;
    }

    // Native platformlarda UDP desteğini kontrol et
    let dgram: any = null;
    try {
      dgram = require('react-native-udp');
    } catch (error) {
      console.log('react-native-udp yüklenemedi');
    }

    // Expo Go veya UDP desteklenmeyen platformlarda mock cihazlar göster
    if (!dgram || !dgram.createSocket) {
      console.log('UDP desteklenmiyor (Expo Go), mock cihazlar gösteriliyor');
      setIsScanning(true);
      setDevices([]);

      setTimeout(() => {
        setDevices(MOCK_DEVICES);
        setIsScanning(false);
      }, 1500);

      return;
    }

    // Gerçek cihazlarda WiFi taraması
    const hasPermissions = await requestWiFiPermissions();
    if (!hasPermissions) {
      console.log("WiFi permissions not granted");
      return;
    }

    setIsScanning(true);
    setDevices([]);

    try {
      console.log('Gerçek WiFi taraması başlatılıyor...');

      const socket = dgram.createSocket('udp4');

      socket.bind(BROADCAST_PORT, () => {
        socket.setBroadcast(true);
        console.log(`UDP socket ${BROADCAST_PORT} portunda dinlemeye başladı`);

        const sendDiscovery = () => {
          const discoveryMessage = Buffer.from('ESP_LED_DISCOVERY');
          socket.send(
            discoveryMessage,
            0,
            discoveryMessage.length,
            BROADCAST_PORT,
            '255.255.255.255',
            (err: Error) => {
              if (err) console.error('Broadcast error:', err);
              else console.log('Discovery broadcast mesajı gönderildi');
            }
          );
        };

        sendDiscovery();

        const interval = setInterval(sendDiscovery, 3000);

        setTimeout(() => {
          clearInterval(interval);
          socket.close();
          setIsScanning(false);
          console.log('WiFi taraması tamamlandı');
        }, 30000);
      });

      socket.on('message', (msg: Buffer, rinfo: any) => {
        try {
          const response = JSON.parse(msg.toString());
          console.log('Cihaz yanıtı alındı:', response);

          if (response.type === 'ESP_LED_DEVICE') {
            const newDevice: WiFiDevice = {
              id: response.id || rinfo.address,
              name: response.name || `ESP LED (${rinfo.address})`,
              ipAddress: rinfo.address,
              port: response.port || ESP_UDP_PORT,
              rssi: response.rssi,
              isConnected: false,
            };

            setDevices((prev) => {
              const existingIndex = prev.findIndex((d) => d.ipAddress === newDevice.ipAddress);
              if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = { ...updated[existingIndex], rssi: newDevice.rssi };
                return updated;
              } else {
                console.log('Yeni cihaz eklendi:', newDevice.name);
                return [...prev, newDevice];
              }
            });
          }
        } catch (error) {
          console.error('Error parsing device response:', error);
        }
      });

      socket.on('error', (err: Error) => {
        console.error('UDP Socket error:', err);
      });

    } catch (error) {
      console.error('WiFi scan error:', error);
      setIsScanning(false);
    }
  }, []);

  const stopScan = useCallback(() => {
    setIsScanning(false);
  }, []);

  const connectDevice = useCallback(async (device: WiFiDevice) => {
    try {
      console.log(`ESP cihazına bağlanılıyor: ${device.name} (${device.ipAddress}:${device.port})`);

      if (Platform.OS === 'web') {
        console.log(`Mock bağlantı kuruldu: ${device.name}`);
        const updatedDevice = { ...device, isConnected: true };
        setConnectedDevice(updatedDevice);
        setDevices((prev) =>
          prev.map((d) => (d.id === device.id ? updatedDevice : { ...d, isConnected: false }))
        );
        return;
      }

      const dgram = require('react-native-udp');
      const socket = dgram.createSocket('udp4');

      socket.bind(() => {
        console.log(`Bağlantı kuruldu: ${device.name}`);

        setUdpSocket(socket);
        const updatedDevice = { ...device, isConnected: true };
        setConnectedDevice(updatedDevice);
        setDevices((prev) =>
          prev.map((d) => (d.id === device.id ? updatedDevice : { ...d, isConnected: false }))
        );
      });

      socket.on('error', (err: Error) => {
        console.error('UDP Socket hatası:', err);
        disconnectDevice();
      });

    } catch (error) {
      console.error("Bağlantı hatası:", error);
    }
  }, []);

  const disconnectDevice = useCallback(() => {
    if (Platform.OS !== 'web' && udpSocket) {
      try {
        udpSocket.close();
        setUdpSocket(null);
      } catch (error) {
        console.error("Disconnect error:", error);
      }
    }

    if (connectedDevice) {
      setDevices((prev) =>
        prev.map((d) => (d.id === connectedDevice.id ? { ...d, isConnected: false } : d))
      );
      setConnectedDevice(null);
    }
  }, [connectedDevice, udpSocket]);

  const sendColor = useCallback((color: string) => {
    if (!connectedDevice) {
      console.log('Bağlı cihaz yok');
      return;
    }

    const [r, g, b] = hexToRgbBytes(color);

    if (Platform.OS === 'web') {
      console.log(`[MOCK] Renk gönderildi RGB(${r}, ${g}, ${b}) -> ${connectedDevice.name}`);
      return;
    }

    if (!udpSocket) {
      console.log('Socket açık değil');
      return;
    }

    try {
      const packet = Buffer.from([0, r, g, b]);

      udpSocket.send(
        packet,
        0,
        packet.length,
        connectedDevice.port,
        connectedDevice.ipAddress,
        (err: Error) => {
          if (err) {
            console.error('Renk gönderme hatası:', err);
          } else {
            console.log(`Renk gönderildi RGB(${r}, ${g}, ${b}) -> ${connectedDevice.name}`);
          }
        }
      );
    } catch (error) {
      console.error("Renk gönderme hatası:", error);
    }
  }, [connectedDevice, udpSocket]);

  const sendRegionColors = useCallback(
    (colors: { top: string; right: string; bottom: string; left: string }) => {
      if (!connectedDevice) {
        console.log('Bağlı cihaz yok');
        return;
      }

      const regions = [colors.top, colors.right, colors.bottom, colors.left];

      // Detect changed regions (delta)
      const changedIndexes: number[] = [];
      for (let i = 0; i < regions.length; i++) {
        if (regions[i] !== lastRegionsRef.current[i]) {
          changedIndexes.push(i);
        }
      }

      // Update last sent regions
      lastRegionsRef.current = [...regions];

      if (Platform.OS === 'web') {
        console.log(`[MOCK] Bölge renkleri gönderildi -> ${connectedDevice.name}`, {
          regions,
          changedIndexes,
        });
        return;
      }

      if (!udpSocket) {
        console.log('Socket açık değil');
        return;
      }

      try {
        // Header: [magic(2), version(1), flags(1), seq(2), ts(2)] = 8 bytes
        const MAGIC = 0xabcd;
        const version = 1;
        const isDelta = changedIndexes.length > 0 && changedIndexes.length < regions.length;
        const flags = isDelta ? 1 : 0;
        seqRef.current = (seqRef.current + 1) & 0xffff;
        const seq = seqRef.current;
        const ts = Date.now() & 0xffff;

        const header = Buffer.allocUnsafe(8);
        header.writeUInt16BE(MAGIC, 0);
        header.writeUInt8(version, 2);
        header.writeUInt8(flags, 3);
        header.writeUInt16BE(seq, 4);
        header.writeUInt16BE(ts, 6);

        let payload: Buffer;

        if (isDelta) {
          // Payload: [CMD=2, count(1), (idx(1), R(1),G(1),B(1))...]
          const entries: number[] = [];
          for (const idx of changedIndexes) {
            const rgb = hexToRgbBytes(regions[idx]);
            entries.push(idx, rgb[0], rgb[1], rgb[2]);
          }
          payload = Buffer.from([2, changedIndexes.length, ...entries]);
        } else {
          // Full payload: [CMD=1, 4 * (R,G,B)]
          const rgbValues: number[] = [];
          for (const color of regions) {
            rgbValues.push(...hexToRgbBytes(color));
          }
          payload = Buffer.from([1, ...rgbValues]);
        }

        const packet = Buffer.concat([header, payload]);

        udpSocket.send(
          packet,
          0,
          packet.length,
          connectedDevice.port,
          connectedDevice.ipAddress,
          (err: Error) => {
            if (err) {
              console.error('Bölge renkleri gönderme hatası:', err);
            } else {
              console.log(`Bölge renkleri gönderildi -> ${connectedDevice.name} (seq=${seq}, delta=${isDelta})`);
            }
          }
        );
      } catch (error) {
        console.error("Bölge renkleri gönderme hatası:", error);
      }
    },
    [connectedDevice, udpSocket]
  );

  return (
    <WiFiContext.Provider
      value={{
        devices,
        connectedDevice,
        isScanning,
        isWiFiEnabled,
        startScan,
        stopScan,
        connectDevice,
        disconnectDevice,
        sendColor,
        sendRegionColors,
      }}
    >
      {children}
    </WiFiContext.Provider>
  );
}

export function useWiFi() {
  const context = useContext(WiFiContext);
  if (!context) {
    throw new Error("useWiFi must be used within a WiFiProvider");
  }
  return context;
}