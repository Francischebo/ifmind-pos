import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from '@zxing/library';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
}

export function BarcodeScanner({ onScan }: BarcodeScannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReader = useRef<BrowserMultiFormatReader | null>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      startScanning();
    } else {
      stopScanning();
    }
    
    return () => stopScanning();
  }, [isOpen]);

  const startScanning = async () => {
    try {
      setIsScanning(true);
      setError('');
      
      // Initialize reader with optimized hints for faster scanning
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.QR_CODE,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      codeReader.current = new BrowserMultiFormatReader(hints);
      
      const videoInputDevices = await codeReader.current.listVideoInputDevices();
      
      if (videoInputDevices.length === 0) {
        setError('No camera found');
        setIsScanning(false);
        return;
      }

      // Prefer back camera on mobile devices
      const preferredDevice = videoInputDevices.find(device => 
        device.label.toLowerCase().includes('back')
      ) || videoInputDevices[0];

      // Request camera with optimized constraints for better performance
      const constraints = {
        video: {
          deviceId: preferredDevice.deviceId,
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          aspectRatio: { ideal: 16/9 }
        }
      };

      await codeReader.current.decodeFromConstraints(
        constraints,
        videoRef.current!,
        (result, err) => {
          if (result) {
            // Clear any pending timeout
            if (scanTimeoutRef.current) {
              clearTimeout(scanTimeoutRef.current);
            }
            
            onScan(result.getText());
            setIsOpen(false);
            setIsScanning(false);
          }
          
          if (err && err.name !== 'NotFoundException') {
            console.error('Barcode scan error:', err);
          }
        }
      );

      setIsScanning(false);
    } catch (err: any) {
      console.error('Camera access error:', err);
      setError(err.message || 'Failed to access camera');
      setIsScanning(false);
    }
  };

  const stopScanning = () => {
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    
    if (codeReader.current) {
      codeReader.current.reset();
      codeReader.current = null;
    }
    
    setIsScanning(false);
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        type="button"
        disabled={isScanning}
      >
        {isScanning ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Camera className="h-4 w-4 mr-2" />
        )}
        Scan Barcode
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan Barcode</DialogTitle>
            <DialogDescription>
              {isScanning ? 'Initializing camera...' : 'Position the barcode within the camera view'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error ? (
              <div className="text-center p-4 rounded-lg bg-destructive/10">
                <p className="text-destructive font-medium">{error}</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setError('');
                    startScanning();
                  }}
                  className="mt-4"
                >
                  Try Again
                </Button>
              </div>
            ) : (
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                {isScanning && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                    <Loader2 className="h-8 w-8 text-white animate-spin" />
                  </div>
                )}
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-64 h-40 border-2 border-primary rounded-lg shadow-lg"></div>
                </div>
              </div>
            )}
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Align barcode within the frame for best results
              </p>
              <p className="text-xs text-muted-foreground">
                Supports EAN, UPC, Code 128, Code 39, and QR codes
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
