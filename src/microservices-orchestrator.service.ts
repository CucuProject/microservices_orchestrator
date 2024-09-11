import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';

interface DependencyConfig {
    [serviceName: string]: {
        dependsOn: string[];
    };
}

interface RetryOptions {
    retry?: number;
    retryDelays?: number;
}

@Injectable()
export class MicroservicesOrchestratorService {
    constructor(private readonly configService: ConfigService) {}

    // Funzione per attendere che le dipendenze siano pronte con retry e delay personalizzabili
    async areDependenciesReady(serviceName: string, options: RetryOptions = {}): Promise<void> {
        const MAX_RETRIES = options.retry || 5; // Default a 5 se non viene specificato
        const RETRY_DELAY = options.retryDelays || 3000; // Default a 3000ms se non viene specificato

        const redisClient = new Redis({
            host: this.configService.get<string>('REDIS_SERVICE_HOST') || 'redis',
            port: parseInt(this.configService.get<string>('REDIS_SERVICE_PORT') || '6379', 10),
        });

        const redisChannel = 'service_ready';
        const configFilePath = path.resolve(__dirname, '../../../service-dependencies.json'); // Percorso del file di configurazione

        // Carichiamo il file di configurazione
        const serviceDependencies: DependencyConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
        const dependencies = serviceDependencies[serviceName]?.dependsOn || [];

        let retries = 0;
        let readyCount = 0;

        const promise = new Promise<void>((resolve) => {
            dependencies.forEach((dependency) => {
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
    notifyServiceReady(serviceName: string): void {
        const redisClient = new Redis({
            host: this.configService.get<string>('REDIS_SERVICE_HOST') || 'redis',
            port: parseInt(this.configService.get<string>('REDIS_SERVICE_PORT') || '6379', 10),
        });

        const redisChannel = 'service_ready';

        // Notifica che il servizio è pronto
        redisClient.publish(redisChannel, `${serviceName}_ready`);
    }
}
