import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import chalk from 'chalk';
import dayjs from 'dayjs';

interface ConfigOptions {
    retry?: number;
    retryDelays?: number;
    redisServiceHost?: string;
    redisServicePort?: string | number;
}

@Injectable()
export class MicroservicesOrchestratorService {
    constructor() {}

    // Funzione per creare la struttura dei log come NestJS
    private log(message: string, context: string, duration: string = '+0ms') {
        const timestamp = dayjs().format('MM/DD/YYYY, h:mm:ss A');
        const formattedMessage = chalk.green(message);
        console.log(
            chalk.cyan(`[Orchestrator] 29 - ${timestamp}     LOG `) +
            chalk.yellow(`[${context}] `) +
            formattedMessage +
            chalk.magenta(` ${duration}`)
        );
    }

    // Funzione per verificare la prontezza delle dipendenze
    async areDependenciesReady(serviceName: string, options: ConfigOptions = {}): Promise<void> {
        this.log(`Inizio controllo delle dipendenze per il servizio: ${serviceName}`, 'OrchestratorService');
        const MAX_RETRIES = options.retry || 5;
        const RETRY_DELAY = options.retryDelays || 3000;

        // Crea il client Redis
        const redisClient = new Redis({
            host: options.redisServiceHost || 'redis',
            port: typeof options.redisServicePort === 'string' ? parseInt(options.redisServicePort, 10) : options.redisServicePort || 6379,
        });

        // Verifica la connessione a Redis
        this.log('Verifica connessione a Redis...', 'OrchestratorService');
        await this.checkRedisConnection(redisClient, MAX_RETRIES, RETRY_DELAY);

        // Ottieni le dipendenze
        const dependencies = JSON.parse(process.env[`${serviceName.toUpperCase()}_DEPENDENCIES`] || '[]');
        this.log(`Dipendenze trovate: ${dependencies}`, 'OrchestratorService');

        // Se non ci sono dipendenze, il servizio può partire dopo la connessione a Redis
        if (dependencies.length === 0) {
            this.log('Nessuna dipendenza trovata, il servizio può partire...', 'OrchestratorService');
            return;
        }

        // Crea un set per tenere traccia delle dipendenze pronte
        const resolvedDependencies = new Set<string>();
        let readyCount = 0;

        // Sottoscrivi al canale Redis per ascoltare quando le dipendenze sono pronte
        const redisChannel = 'service_ready';
        redisClient.subscribe(redisChannel, (err) => {
            if (err) {
                console.error(chalk.red('[Orchestrator] Errore nella sottoscrizione al canale Redis:', err));
            } else {
                this.log(`Sottoscritto al canale ${redisChannel}`, 'OrchestratorService');
            }
        });

        return new Promise<void>((resolve, reject) => {
            // Timeout per evitare blocchi infiniti
            const timeout = setTimeout(() => {
                reject(new Error(`Timeout: non tutte le dipendenze sono pronte dopo ${MAX_RETRIES * RETRY_DELAY} ms.`));
            }, MAX_RETRIES * RETRY_DELAY);

            // Ascolta i messaggi da Redis
            redisClient.on('message', (channel, message) => {
                dependencies.forEach((dependency: string) => {
                    if (message === `${dependency}_ready` && !resolvedDependencies.has(dependency)) {
                        resolvedDependencies.add(dependency);
                        readyCount++;
                        this.log(`Dipendenza pronta: ${dependency}. Pronte ${readyCount}/${dependencies.length}`, 'OrchestratorService');
                        if (readyCount === dependencies.length) {
                            clearTimeout(timeout);
                            this.log('Tutte le dipendenze sono pronte!', 'OrchestratorService');
                            resolve();
                        }
                    }
                });
            });
        });
    }

    // Funzione per notificare che il servizio è pronto
    notifyServiceReady(serviceName: string, options: ConfigOptions = {}): void {
        const redisClient = new Redis({
            host: options.redisServiceHost || 'redis',
            port: typeof options.redisServicePort === 'string' ? parseInt(options.redisServicePort, 10) : options.redisServicePort || 6379,
        });

        const redisChannel = 'service_ready';
        this.log(`Notifica che il servizio ${serviceName} è pronto...`, 'OrchestratorService');
        redisClient.publish(redisChannel, `${serviceName}_ready`, (err, reply) => {
            if (err) {
                console.error(chalk.red(`[Orchestrator] Errore durante la pubblicazione del messaggio su Redis: ${err.message}`));
            } else {
                this.log(`Messaggio pubblicato con successo su Redis. Risposta: ${reply}`, 'OrchestratorService');
            }
            redisClient.quit();
        });
    }

    // Funzione per controllare la connessione a Redis
    private async checkRedisConnection(redisClient: Redis, maxRetries: number, retryDelay: number): Promise<void> {
        let retries = 0;
        while (retries < maxRetries) {
            try {
                this.log(`Tentativo di connessione a Redis (${retries + 1}/${maxRetries})...`, 'OrchestratorService');
                await redisClient.ping();
                this.log('Redis è pronto!', 'OrchestratorService');
                return;
            } catch (err) {
                retries++;
                this.log(`Connessione a Redis fallita, tentativo ${retries}/${maxRetries}`, 'OrchestratorService');
                if (retries >= maxRetries) {
                    throw new Error('Redis non è disponibile dopo vari tentativi.');
                }
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
        }
    }
}
