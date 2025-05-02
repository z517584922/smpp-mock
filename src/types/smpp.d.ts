declare module 'smpp' {
    export class Session {
        constructor(options: {
            socket: any;
            inactivityTimeout?: number;
            keepAlive?: boolean;
            reconnectTimer?: number;
            connectTimeout?: number;
            enquireLinkTimer?: number;
        });
        
        on(event: string, callback: (pdu: PDU) => void): void;
        on(event: 'state', callback: (state: string) => void): void;
        on(event: 'error', callback: (error: Error) => void): void;
        on(event: 'close', callback: () => void): void;
        on(event: 'bind_transceiver_resp', callback: (pdu: PDU) => void): void;
        on(event: 'submit_sm_resp', callback: (pdu: PDU) => void): void;
        on(event: 'enquire_link_resp', callback: (pdu: PDU) => void): void;
        on(event: 'unbind_resp', callback: (pdu: PDU) => void): void;
        
        send(pdu: PDU): void;
        bind_transceiver(options: { system_id: string; password: string }): void;
        submit_sm(options: { source_addr: string; destination_addr: string; short_message: string }): void;
        enquire_link(): void;
        unbind(): void;
    }

    export class PDU {
        sequence_number: number;
        command_status: number;
        system_id?: string;
        password?: string;
        source_addr?: string;
        destination_addr?: string;
        short_message?: string;
        message_id?: string;
        
        response(options?: {
            command_status?: number;
            message_id?: string;
        }): PDU;
    }
} 