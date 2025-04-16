import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import dayjs from 'dayjs';
import kleur from 'kleur';

// Force kleur to enable colors
kleur.enabled = true;

interface ConfigOptions {
    retry?: number;
    retryDelays?: number;
    redisServiceHost?: string;
    redisServicePort?: string | number;
    persistentCheck?: boolean; // New option for persistent checking
}

@Injectable()
export class MicroservicesOrchestratorService {
    private static readonly READY_KEY_PREFIX = 'service_ready:';
    private static readonly READY_CHANNEL = 'service_ready';
    
    constructor() {}

    // Function to check if dependencies are ready
    async areDependenciesReady(serviceName: string, options: ConfigOptions = {}): Promise<void> {
        this.log(`[Orchestrator] Starting dependency check for service: ${serviceName}`, 'DependencyChecker');
        const MAX_RETRIES = options.retry || 5;
        const RETRY_DELAY = options.retryDelays || 3000;
        const PERSISTENT_CHECK = options.persistentCheck || false;

        // Create Redis client
        const redisClient = new Redis({
            host: options.redisServiceHost || 'redis',
            port: typeof options.redisServicePort === 'string' 
                ? parseInt(options.redisServicePort, 10) 
                : options.redisServicePort || 6379,
        });

        // Verify Redis connection
        this.log('[Orchestrator] Verifying Redis connection...', 'RedisConnection');
        await this.checkRedisConnection(redisClient, MAX_RETRIES, RETRY_DELAY);

        // Get dependencies
        const dependencies = JSON.parse(process.env[`${serviceName.toUpperCase()}_DEPENDENCIES`] || '[]');
        this.log(`[Orchestrator] Dependencies found: ${dependencies}`, 'DependencyChecker');

        // If no dependencies, service can start after Redis connection
        if (dependencies.length === 0) {
            this.log('[Orchestrator] No dependencies found, service can start...', 'DependencyChecker');
            redisClient.quit();
            return;
        }

        // First check if dependencies are already ready in Redis
        const readyDependencies = new Set<string>();
        let readyCount = 0;

        // Check Redis for already ready services
        for (const dependency of dependencies) {
            const isReady = await redisClient.exists(`${MicroservicesOrchestratorService.READY_KEY_PREFIX}${dependency}`);
            
            if (isReady) {
                readyDependencies.add(dependency);
                readyCount++;
                this.log(`[Orchestrator] Dependency already ready: ${dependency}. Ready ${readyCount}/${dependencies.length}`, 'DependencyChecker');
            }
        }

        // If all dependencies are ready, return immediately
        if (readyCount === dependencies.length) {
            this.log('[Orchestrator] All dependencies are already ready!', 'DependencyChecker');
            redisClient.quit();
            return;
        }

        // Subscribe to Redis channel to listen for ready services
        redisClient.subscribe(MicroservicesOrchestratorService.READY_CHANNEL, (err) => {
            if (err) {
                console.error(kleur.red('[Orchestrator] Error subscribing to Redis channel:'), err);
            } else {
                this.log(`[Orchestrator] Subscribed to channel ${MicroservicesOrchestratorService.READY_CHANNEL}`, 'RedisConnection');
            }
        });

        return new Promise<void>((resolve, reject) => {
            // Timeout to avoid infinite blocks
            const timeout = setTimeout(() => {
                redisClient.quit();
                reject(new Error(`Timeout: not all dependencies are ready after ${MAX_RETRIES * RETRY_DELAY} ms.`));
            }, MAX_RETRIES * RETRY_DELAY);

            // Listen for messages from Redis
            redisClient.on('message', (channel, message) => {
                dependencies.forEach((dependency: string) => {
                    if (message === `${dependency}_ready` && !readyDependencies.has(dependency)) {
                        readyDependencies.add(dependency);
                        readyCount++;
                        this.log(`[Orchestrator] Dependency ready: ${dependency}. Ready ${readyCount}/${dependencies.length}`, 'DependencyChecker');
                        
                        if (readyCount === dependencies.length) {
                            clearTimeout(timeout);
                            this.log('[Orchestrator] All dependencies are ready!', 'DependencyChecker');
                            if (!PERSISTENT_CHECK) {
                                redisClient.quit();
                            }
                            resolve();
                        }
                    }
                });
            });
        });
    }

    // Function to notify that the service is ready
    async notifyServiceReady(serviceName: string, options: ConfigOptions = {}): Promise<void> {
        const redisClient = new Redis({
            host: options.redisServiceHost || 'redis',
            port: typeof options.redisServicePort === 'string' 
                ? parseInt(options.redisServicePort, 10) 
                : options.redisServicePort || 6379,
        });

        const readyKey = `${MicroservicesOrchestratorService.READY_KEY_PREFIX}${serviceName}`;
        const readyChannel = MicroservicesOrchestratorService.READY_CHANNEL;
        
        this.log(`[Orchestrator] Notifying that service ${serviceName} is ready...`, 'RedisNotification');
        
        try {
            // Store service ready status in Redis with 24h expiry (configurable)
            await redisClient.set(readyKey, 'ready', 'EX', 86400); // 24 hours expiry
            
            // Publish message to channel
            const reply = await redisClient.publish(readyChannel, `${serviceName}_ready`);
            
            this.log(`[Orchestrator] Message successfully published to Redis. Reply: ${reply}`, 'RedisNotification');
        } catch (err) {
            if (err instanceof Error) {
                console.error(kleur.red(`[Orchestrator] Error during Redis publish: ${err.message}`));
            } else {
                console.error(kleur.red(`[Orchestrator] Unknown error during Redis publish: ${err}`));
            }
        } finally {
            redisClient.quit();
        }
    }

    // Function to check if specific services are ready (useful for gateway)
    async areServicesReady(serviceNames: string[], options: ConfigOptions = {}): Promise<Map<string, boolean>> {
        const redisClient = new Redis({
            host: options.redisServiceHost || 'redis',
            port: typeof options.redisServicePort === 'string' 
                ? parseInt(options.redisServicePort, 10) 
                : options.redisServicePort || 6379,
        });

        const result = new Map<string, boolean>();
        
        try {
            // Check each service in Redis
            for (const serviceName of serviceNames) {
                const isReady = await redisClient.exists(`${MicroservicesOrchestratorService.READY_KEY_PREFIX}${serviceName}`);
                result.set(serviceName, isReady === 1);
            }
        } catch (err) {
            if (err instanceof Error) {
                console.error(kleur.red(`[Orchestrator] Error checking services: ${err.message}`));
            } else {
                console.error(kleur.red(`[Orchestrator] Unknown error checking services: ${err}`));
            }
        } finally {
            redisClient.quit();
        }
        
        return result;
    }

    // Reset service status (useful during testing or manual intervention)
    async resetServiceStatus(serviceName: string, options: ConfigOptions = {}): Promise<void> {
        const redisClient = new Redis({
            host: options.redisServiceHost || 'redis',
            port: typeof options.redisServicePort === 'string' 
                ? parseInt(options.redisServicePort, 10) 
                : options.redisServicePort || 6379,
        });

        try {
            await redisClient.del(`${MicroservicesOrchestratorService.READY_KEY_PREFIX}${serviceName}`);
            this.log(`[Orchestrator] Reset status for service: ${serviceName}`, 'StatusReset');
        } catch (err) {
            if (err instanceof Error) {
                console.error(kleur.red(`[Orchestrator] Error resetting service status: ${err.message}`));
            } else {
                console.error(kleur.red(`[Orchestrator] Unknown error resetting service status: ${err}`));
            }
        } finally {
            redisClient.quit();
        }
    }

    // Function to check Redis connection
    private async checkRedisConnection(redisClient: Redis, maxRetries: number, retryDelay: number): Promise<void> {
        let retries = 0;
        while (retries < maxRetries) {
            try {
                this.log(`[Orchestrator] Attempting to connect to Redis (${retries + 1}/${maxRetries})...`, 'RedisConnection');
                await redisClient.ping();
                this.log('[Orchestrator] Redis is ready!', 'RedisConnection');
                return;
            } catch (err) {
                retries++;
                console.error(kleur.red(`[Orchestrator] Redis connection failed, attempt ${retries}/${maxRetries}`));
                if (retries >= maxRetries) {
                    throw new Error('Redis is unavailable after multiple attempts.');
                }
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
        }
    }

    // Colorful log function
    private log(message: string, context: string, duration: string = '+0ms') {
        const customHex = (hexColor: string) => (text: string) => {
            const r = parseInt(hexColor.slice(1, 3), 16);
            const g = parseInt(hexColor.slice(3, 5), 16);
            const b = parseInt(hexColor.slice(5, 7), 16);
            return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
        };

        const timestamp = dayjs().format('MM/DD/YYYY, h:mm:ss A');
        const formattedMessage = kleur.green(message);
        const hexColor = customHex('#049b84');

        console.log(
            hexColor(`[Orchestrator] - `) +
            `${timestamp}     ` +
            hexColor(`LOG `) +
            kleur.yellow(`[${context}] `) +
            formattedMessage +
            kleur.yellow(` ${duration}`)
        );
    }
}