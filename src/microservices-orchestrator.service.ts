import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';  // Importa Redis come classe, non come namespace

interface ConfigOptions {
    retry?: number;
    retryDelays?: number;
    redisServiceHost?: string;
    redisServicePort?: string | number;
}

@Injectable()
export class MicroservicesOrchestratorService {
    constructor() {}

    async areDependenciesReady(serviceName: string, options: ConfigOptions = {}): Promise<void> {
        const MAX_RETRIES = options.retry || 5; // Default a 5 se non viene specificato
        const RETRY_DELAY = options.retryDelays || 3000; // Default a 3000ms se non viene specificato

        const redisClient = new Redis({
            host: options.redisServiceHost || 'redis',
            port: typeof options.redisServicePort === 'string' ? parseInt(options.redisServicePort, 10) : options.redisServicePort || 6379,
        });

        await this.checkRedisConnection(redisClient, MAX_RETRIES, RETRY_DELAY);

        const redisChannel = 'service_ready';
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

    notifyServiceReady(serviceName: string, options: ConfigOptions = {}): void {
        const redisClient = new Redis({
            host: options.redisServiceHost || 'redis',
            port: typeof options.redisServicePort === 'string' ? parseInt(options.redisServicePort, 10) : options.redisServicePort || 6379,
        });

        const redisChannel = 'service_ready';

        redisClient.publish(redisChannel, `${serviceName}_ready`);
    }

    private async checkRedisConnection(redisClient: Redis, maxRetries: number, retryDelay: number): Promise<void> {
        let retries = 0;
        while (retries < maxRetries) {
            try {
                await redisClient.ping(); // Verifica se Redis risponde
                console.log('Redis è pronto');
                return; // Redis è pronto
            } catch (err) {
                retries++;
                console.error(`Connessione a Redis fallita, tentativo ${retries}/${maxRetries}`);
                if (retries >= maxRetries) {
                    throw new Error('Redis non è disponibile dopo vari tentativi.');
                }
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
        }
    }
}
