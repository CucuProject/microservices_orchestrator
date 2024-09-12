import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

interface ConfigOptions {
    retry?: number;
    retryDelays?: number;
    redisServiceHost?: string;
    redisServicePort?: string | number;
}

@Injectable()
export class MicroservicesOrchestratorService {
    constructor() {}

    // Funzione per attendere che le dipendenze siano pronte con retry e delay personalizzabili
    async areDependenciesReady(serviceName: string, options: ConfigOptions = {}): Promise<void> {
        const MAX_RETRIES = options.retry || 5; // Default a 5 se non viene specificato
        const RETRY_DELAY = options.retryDelays || 3000; // Default a 3000ms se non viene specificato

        // Usa i valori forniti negli options, altrimenti default
        const redisClient = new Redis({
            host: options.redisServiceHost || 'redis',
            port: typeof options.redisServicePort === 'string' ? parseInt(options.redisServicePort, 10) : options.redisServicePort || 6379,
        });

        const redisChannel = 'service_ready';

        // Ottieni la variabile di dipendenze specifica del servizio (es. GATEWAY_DEPENDENCIES)
        const dependencies = JSON.parse(process.env[`${serviceName.toUpperCase()}_DEPENDENCIES`] || '[]');

        let retries = 0;
        let readyCount = 0;

        const promise = new Promise<void>((resolve) => {
            dependencies.forEach((dependency: string) => {
                redisClient.subscribe(redisChannel, (err) => {
                    if (err) {
                        console.error('Errore nella sottoscrizione al canale Redis:', err);
                    }
                });

                redisClient.on('message', (channel, message) => {
                    if (message === `${dependency}_ready`) {
                        readyCount++;
                        if (readyCount === dependencies.length) {
                            resolve();
                        }
                    }
                });
            });

            if (dependencies.length === 0) {
                resolve(); // Se non abbiamo dipendenze, siamo subito pronti
            }
        });

        while (retries < MAX_RETRIES) {
            try {
                await promise;
                return; // Tutte le dipendenze sono pronte
            } catch (error) {
                retries++;
                if (retries >= MAX_RETRIES) {
                    throw new Error(`Le dipendenze non sono pronte dopo ${MAX_RETRIES} tentativi.`);
                }
                console.log(`Retrying... tentativo ${retries}`);
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
            }
        }
    }

    // Funzione per notificare lo stato di prontezza
    notifyServiceReady(serviceName: string, options: ConfigOptions = {}): void {
        const redisClient = new Redis({
            host: options.redisServiceHost || 'redis',
            port: typeof options.redisServicePort === 'string' ? parseInt(options.redisServicePort, 10) : options.redisServicePort || 6379,
        });

        const redisChannel = 'service_ready';

        // Notifica che il servizio è pronto
        redisClient.publish(redisChannel, `${serviceName}_ready`);
    }
}
