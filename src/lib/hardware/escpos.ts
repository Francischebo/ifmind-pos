export class WebPrinterService {
  private port: SerialPort | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  async requestPermission(): Promise<boolean> {
    try {
      if (!('serial' in navigator)) {
        console.error('Web Serial API not supported in this browser.');
        return false;
      }
      
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 9600 });
      this.writer = this.port.writable?.getWriter() || null;
      
      return !!this.writer;
    } catch (error) {
      console.error('Error requesting printer permission:', error);
      return false;
    }
  }

  async connectToPairedPrinter(): Promise<boolean> {
    try {
      if (!('serial' in navigator)) return false;
      
      const ports = await navigator.serial.getPorts();
      if (ports.length > 0) {
        this.port = ports[0];
        await this.port.open({ baudRate: 9600 });
        this.writer = this.port.writable?.getWriter() || null;
        return !!this.writer;
      }
      return false;
    } catch (error) {
      console.error('Error connecting to paired printer:', error);
      return false;
    }
  }

  async printReceipt(text: string): Promise<void> {
    if (!this.writer) {
      const connected = await this.connectToPairedPrinter();
      if (!connected) return;
    }

    try {
      const encoder = new TextEncoder();
      const escInit = new Uint8Array([0x1B, 0x40]); // Initialize printer
      await this.writer!.write(escInit);

      const textData = encoder.encode(text + '\n\n\n\n\n'); // Add some feed lines
      await this.writer!.write(textData);

      const cutPaper = new Uint8Array([0x1D, 0x56, 0x00]); // Full cut
      await this.writer!.write(cutPaper);
    } catch (error) {
      console.error('Error printing receipt:', error);
    }
  }

  async openCashDrawer(): Promise<void> {
    if (!this.writer) {
      const connected = await this.connectToPairedPrinter();
      if (!connected) return;
    }

    try {
      // Standard ESC/POS command to open cash drawer
      // ESC p m t1 t2
      // m = 0 (drawer 1), t1 = 25 (pulse on time), t2 = 250 (pulse off time)
      const openDrawer = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);
      await this.writer!.write(openDrawer);
    } catch (error) {
      console.error('Error opening cash drawer:', error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.writer) {
      this.writer.releaseLock();
      this.writer = null;
    }
    if (this.port) {
      await this.port.close();
      this.port = null;
    }
  }
}

export const printerService = new WebPrinterService();
