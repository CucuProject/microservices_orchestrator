import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import dayjs from 'dayjs';
import kleur from 'kleur';

// Forza kleur ad abilitare i colori
kleur.enabled = true;

interface ConfigOptions {
    retry?: number;
    retryDelays?: number;
    redisServiceHost?: string;
    redisServicePort?: string | number;
}

@Injectable()
export class MicroservicesOrchestratorService {
    constructor() {}

    // Funzione per verificare la prontezza delle dipendenze
    async areDependenciesReady(serviceName: string, options: ConfigOptions = {}): Promise<void> {
        this.log(`[Orchestrator] Inizio controllo delle dipendenze per il servizio: ${serviceName}`, 'DependencyChecker');
        const MAX_RETRIES = options.retry || 5;
        const RETRY_DELAY = options.retryDelays || 3000;

        // Crea il client Redis
        const redisClient = new Redis({
            host: options.redisServiceHost || 'redis',
            port: typeof options.redisServicePort === 'string' ? parseInt(options.redisServicePort, 10) : options.redisServicePort || 6379,
        });

        // Verifica la connessione a Redis
        this.log('[Orchestrator] Verifica connessione a Redis...', 'RedisConnection');
        await this.checkRedisConnection(redisClient, MAX_RETRIES, RETRY_DELAY);

        // Ottieni le dipendenze
        const dependencies = JSON.parse(process.env[`${serviceName.toUpperCase()}_DEPENDENCIES`] || '[]');
        this.log(`[Orchestrator] Dipendenze trovate: ${dependencies}`, 'DependencyChecker');

        // Se non ci sono dipendenze, il servizio può partire dopo la connessione a Redis
        if (dependencies.length === 0) {
            this.log('[Orchestrator] Nessuna dipendenza trovata, il servizio può partire...', 'DependencyChecker');
            return;
        }

        // Crea un set per tenere traccia delle dipendenze pronte
        const resolvedDependencies = new Set<string>();
        let readyCount = 0;

        // Sottoscrivi al canale Redis per ascoltare quando le dipendenze sono pronte
        const redisChannel = 'service_ready';
        redisClient.subscribe(redisChannel, (err) => {
            if (err) {
                console.error(kleur.red('[Orchestrator] Errore nella sottoscrizione al canale Redis:'), err);
            } else {
                this.log(`[Orchestrator] Sottoscritto al canale ${redisChannel}`, 'RedisConnection');
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
                        this.log(`[Orchestrator] Dipendenza pronta: ${dependency}. Pronte ${readyCount}/${dependencies.length}`, 'DependencyChecker');
                        if (readyCount === dependencies.length) {
                            clearTimeout(timeout);
                            this.log('[Orchestrator] Tutte le dipendenze sono pronte!', 'DependencyChecker');
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
        this.log(`[Orchestrator] Notifica che il servizio ${serviceName} è pronto...`, 'RedisNotification');
        redisClient.publish(redisChannel, `${serviceName}_ready`, (err, reply) => {
            if (err) {
                console.error(kleur.red(`[Orchestrator] Errore durante la pubblicazione del messaggio su Redis: ${err.message}`));
            } else {
                this.log(`[Orchestrator] Messaggio pubblicato con successo su Redis. Risposta: ${reply}`, 'RedisNotification');
            }
            redisClient.quit();
        });
    }

    // Funzione per controllare la connessione a Redis
    private async checkRedisConnection(redisClient: Redis, maxRetries: number, retryDelay: number): Promise<void> {
        let retries = 0;
        while (retries < maxRetries) {
            try {
                this.log(`[Orchestrator] Tentativo di connessione a Redis (${retries + 1}/${maxRetries})...`, 'RedisConnection');
                await redisClient.ping();
                this.log('[Orchestrator] Redis è pronto!', 'RedisConnection');
                return;
            } catch (err) {
                retries++;
                console.error(kleur.red(`[Orchestrator] Connessione a Redis fallita, tentativo ${retries}/${maxRetries}`));
                if (retries >= maxRetries) {
                    throw new Error('Redis non è disponibile dopo vari tentativi.');
                }
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
        }
    }

    // Funzione di log colorata
    private log(message: string, context: string, duration: string = '+0ms') {
        const customHex = (hexColor: string) => (text: string) => {
            const r = parseInt(hexColor.slice(1, 3), 16);
            const g = parseInt(hexColor.slice(3, 5), 16);
            const b = parseInt(hexColor.slice(5, 7), 16);
            return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
        };

        const timestamp = dayjs().format('MM/DD/YYYY, h:mm:ss A');
        const formattedMessage = kleur.green(message); // Usa il colore verde predefinito
        const hexColor = customHex('#049b84'); // Definisci il colore esadecimale personalizzato

        console.log(
            hexColor(`[Orchestrator] 29 - ${kleur.white(timestamp)}     LOG `) + // Usa il colore esadecimale personalizzato
            kleur.yellow(`[${context}] `) + // Context in giallo
            formattedMessage + // Messaggio formattato in verde
            kleur.yellow(` ${duration}`) // Durata in giallo
        );
    }

}
