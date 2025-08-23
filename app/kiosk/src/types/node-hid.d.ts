declare module 'node-hid' {
  export interface Device {
    vendorId?: number;
    productId?: number;
    path?: string;
    serialNumber?: string;
    manufacturer?: string;
    product?: string;
    release?: number;
    interface?: number;
    usagePage?: number;
    usage?: number;
  }

  export default class HID {
    constructor(path: string);
    constructor(vid: number, pid: number);
    
    static devices(): Device[];
    static setDriverType(type: string): void;
    
    close(): void;
    read(callback: (err: any, data: number[]) => void): void;
    readSync(): number[];
    readTimeout(timeoutMs: number): number[];
    write(values: number[]): number;
    getFeatureReport(reportId: number, reportLength: number): number[];
    sendFeatureReport(data: number[]): number;
    
    on(event: 'data', listener: (data: Buffer) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
  }
}