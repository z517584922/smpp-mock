declare module 'smpp' {
    export class Session {
        constructor(params: {
            socket: any;
            inactivityTimeout?: number;
            keepAlive?: boolean;
            enquireLinkTimer?: number;
            reconnectTimer?: number;
            connectTimeout?: number;
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
        bind_transceiver(params: { system_id: string; password: string }): void;
        submit_sm(params: { source_addr: string; destination_addr: string; short_message: string }): void;
        enquire_link(): void;
        unbind(): void;
    }

    export class PDU {
        command: string;
        command_status: number;
        sequence_number: number;
        message_id?: string;
        source_addr?: string;
        destination_addr?: string;
        short_message?: Buffer | string;
        receipted_message_id?: string;
        message_state?: string;
        esm_class?: number;
        system_id?: string;
        password?: string;
        
        constructor(command: string, params?: Record<string, any>);
        response(params?: Record<string, any>): PDU;
    }
} 