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
        console.log(`Versione 0.1`);
        console.log(`[Orchestrator] Inizio controllo delle dipendenze per il servizio: ${serviceName}`);
        const MAX_RETRIES = options.retry || 5;
        const RETRY_DELAY = options.retryDelays || 3000;

        const redisClient = new Redis({
            host: options.redisServiceHost || 'redis',
            port: typeof options.redisServicePort === 'string' ? parseInt(options.redisServicePort, 10) : options.redisServicePort || 6379,
        });

        console.log('[Orchestrator] Verifica connessione a Redis...');
        await this.checkRedisConnection(redisClient, MAX_RETRIES, RETRY_DELAY);

        const redisChannel = 'service_ready';
        const dependencies = JSON.parse(process.env[`${serviceName.toUpperCase()}_DEPENDENCIES`] || '[]');
        console.log(`[Orchestrator] Dipendenze trovate: ${dependencies}`);

        let readyCount = 0;
        const resolvedDependencies = new Set<string>();

        const promise = new Promise<void>((resolve) => {
            dependencies.forEach((dependency: string) => {
                console.log(`[Orchestrator] Sottoscrizione al canale Redis per la dipendenza: ${dependency}`);
                redisClient.subscribe(redisChannel, (err) => {
                    if (err) {
                        console.error('[Orchestrator] Errore nella sottoscrizione al canale Redis:', err);
                    }
                });

                redisClient.on('message', (channel, message) => {
                    // Evita di contare lo stesso messaggio più volte
                    if (message === `${dependency}_ready` && !resolvedDependencies.has(dependency)) {
                        resolvedDependencies.add(dependency);
                        readyCount++;
                        console.log(`[Orchestrator] Dipendenza pronta: ${dependency}. Pronte ${readyCount}/${dependencies.length}`);
                        if (readyCount === dependencies.length) {
                            resolve();
                        }
                    }
                });
            });

            if (dependencies.length === 0) {
                console.log('[Orchestrator] Nessuna dipendenza trovata, procedo...');
                resolve(); // Se non abbiamo dipendenze, siamo subito pronti
            }
        });

        try {
            await promise;
            console.log('[Orchestrator] Tutte le dipendenze sono pronte!');
        } catch (error) {
            console.error(`[Orchestrator] Errore durante il controllo delle dipendenze: ${error}`);
        }
    }

    notifyServiceReady(serviceName: string, options: ConfigOptions = {}): void {
        const redisClient = new Redis({
            host: options.redisServiceHost || 'redis',
            port: typeof options.redisServicePort === 'string' ? parseInt(options.redisServicePort, 10) : options.redisServicePort || 6379,
        });

        const redisChannel = 'service_ready';
        console.log(`[Orchestrator] Notifica che il servizio ${serviceName} è pronto...`);

        redisClient.publish(redisChannel, `${serviceName}_ready`, (err, reply) => {
            if (err) {
                console.error(`[Orchestrator] Errore durante la pubblicazione del messaggio su Redis: ${err.message}`);
            } else {
                console.log(`[Orchestrator] Messaggio pubblicato con successo su Redis. Risposta: ${reply}`);
            }
            redisClient.quit(); // Chiudi la connessione dopo la pubblicazione
        });
    }

    private async checkRedisConnection(redisClient: Redis, maxRetries: number, retryDelay: number): Promise<void> {
        let retries = 0;
        while (retries < maxRetries) {
            try {
                console.log(`[Orchestrator] Tentativo di connessione a Redis (${retries + 1}/${maxRetries})...`);
                await redisClient.ping();
                console.log('[Orchestrator] Redis è pronto!');
                return;
            } catch (err) {
                retries++;
                console.error(`[Orchestrator] Connessione a Redis fallita, tentativo ${retries}/${maxRetries}`);
                if (retries >= maxRetries) {
                    throw new Error('Redis non è disponibile dopo vari tentativi.');
                }
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
        }
    }
}
