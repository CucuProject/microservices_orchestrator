"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MicroservicesOrchestratorService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const dayjs_1 = __importDefault(require("dayjs"));
const kleur_1 = __importDefault(require("kleur"));
const fs = __importStar(require("fs"));
// Force kleur to enable colors
kleur_1.default.enabled = true;
let MicroservicesOrchestratorService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var MicroservicesOrchestratorService = _classThis = class {
        constructor() { }
        // ─────────────────────────────────────────────────────────────────────────────
        //  ESEMPIO: areDependenciesReady
        // ─────────────────────────────────────────────────────────────────────────────
        async areDependenciesReady(serviceName, options = {}) {
            this.log(`[Orchestrator] Starting dependency check for service: ${serviceName}`, 'DependencyChecker');
            const MAX_RETRIES = options.retry || 5;
            const RETRY_DELAY = options.retryDelays || 3000;
            const PERSISTENT_CHECK = options.persistentCheck || false;
            // Costruiamo la configurazione per ioredis, in base a useTls
            const redisClient = this.createRedisClient(options);
            // Verifica Redis connection
            this.log('[Orchestrator] Verifying Redis connection...', 'RedisConnection');
            await this.checkRedisConnection(redisClient, MAX_RETRIES, RETRY_DELAY);
            // Recupera le dipendenze da una env: es. "GATEWAY_DEPENDENCIES"
            const dependencies = JSON.parse(process.env[`${serviceName.toUpperCase()}_DEPENDENCIES`] || '[]');
            this.log(`[Orchestrator] Dependencies found: ${dependencies}`, 'DependencyChecker');
            // Se non ci sono dipendenze, basta che Redis sia ok
            if (dependencies.length === 0) {
                this.log('[Orchestrator] No dependencies found, service can start...', 'DependencyChecker');
                redisClient.quit();
                return;
            }
            // Verifica in Redis se qualche dipendenza risulta già pronta
            const readyDependencies = new Set();
            let readyCount = 0;
            for (const dependency of dependencies) {
                const isReady = await redisClient.exists(`${MicroservicesOrchestratorService.READY_KEY_PREFIX}${dependency}`);
                if (isReady) {
                    readyDependencies.add(dependency);
                    readyCount++;
                    this.log(`[Orchestrator] Dependency already ready: ${dependency}. Ready ${readyCount}/${dependencies.length}`, 'DependencyChecker');
                }
            }
            // Se tutte pronte => ok
            if (readyCount === dependencies.length) {
                this.log('[Orchestrator] All dependencies are already ready!', 'DependencyChecker');
                redisClient.quit();
                return;
            }
            // Altrimenti ci sottoscriviamo a `service_ready`
            redisClient.subscribe(MicroservicesOrchestratorService.READY_CHANNEL, (err) => {
                if (err) {
                    console.error(kleur_1.default.red('[Orchestrator] Error subscribing to Redis channel:'), err);
                }
                else {
                    this.log(`[Orchestrator] Subscribed to channel ${MicroservicesOrchestratorService.READY_CHANNEL}`, 'RedisConnection');
                }
            });
            // Aspettiamo in una Promise finché tutte le dipendenze non sono pronte
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    redisClient.quit();
                    reject(new Error(`Timeout: not all dependencies are ready after ${MAX_RETRIES * RETRY_DELAY} ms.`));
                }, MAX_RETRIES * RETRY_DELAY);
                redisClient.on('message', (channel, message) => {
                    dependencies.forEach((dependency) => {
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
        // ─────────────────────────────────────────────────────────────────────────────
        //  ESEMPIO: notifyServiceReady
        // ─────────────────────────────────────────────────────────────────────────────
        async notifyServiceReady(serviceName, options = {}) {
            const redisClient = this.createRedisClient(options);
            const readyKey = `${MicroservicesOrchestratorService.READY_KEY_PREFIX}${serviceName}`;
            const readyChannel = MicroservicesOrchestratorService.READY_CHANNEL;
            this.log(`[Orchestrator] Notifying that service ${serviceName} is ready...`, 'RedisNotification');
            try {
                // set con scadenza 24h
                await redisClient.set(readyKey, 'ready', 'EX', 86400);
                // Publish
                const reply = await redisClient.publish(readyChannel, `${serviceName}_ready`);
                this.log(`[Orchestrator] Message successfully published to Redis. Reply: ${reply}`, 'RedisNotification');
            }
            catch (err) {
                if (err instanceof Error) {
                    console.error(kleur_1.default.red(`[Orchestrator] Error during Redis publish: ${err.message}`));
                }
                else {
                    console.error(kleur_1.default.red(`[Orchestrator] Unknown error during Redis publish: ${err}`));
                }
            }
            finally {
                redisClient.quit();
            }
        }
        // ─────────────────────────────────────────────────────────────────────────────
        //  ESEMPIO: areServicesReady
        // ─────────────────────────────────────────────────────────────────────────────
        async areServicesReady(serviceNames, options = {}) {
            const redisClient = this.createRedisClient(options);
            const result = new Map();
            try {
                for (const svc of serviceNames) {
                    const isReady = await redisClient.exists(`${MicroservicesOrchestratorService.READY_KEY_PREFIX}${svc}`);
                    result.set(svc, isReady === 1);
                }
            }
            catch (err) {
                if (err instanceof Error) {
                    console.error(kleur_1.default.red(`[Orchestrator] Error checking services: ${err.message}`));
                }
                else {
                    console.error(kleur_1.default.red(`[Orchestrator] Unknown error checking services: ${err}`));
                }
            }
            finally {
                redisClient.quit();
            }
            return result;
        }
        // ─────────────────────────────────────────────────────────────────────────────
        //  ESEMPIO: resetServiceStatus
        // ─────────────────────────────────────────────────────────────────────────────
        async resetServiceStatus(serviceName, options = {}) {
            const redisClient = this.createRedisClient(options);
            try {
                await redisClient.del(`${MicroservicesOrchestratorService.READY_KEY_PREFIX}${serviceName}`);
                this.log(`[Orchestrator] Reset status for service: ${serviceName}`, 'StatusReset');
            }
            catch (err) {
                if (err instanceof Error) {
                    console.error(kleur_1.default.red(`[Orchestrator] Error resetting service status: ${err.message}`));
                }
                else {
                    console.error(kleur_1.default.red(`[Orchestrator] Unknown error resetting service status: ${err}`));
                }
            }
            finally {
                redisClient.quit();
            }
        }
        // ─────────────────────────────────────────────────────────────────────────────
        //  Funzione che crea un client Redis con/senza TLS
        // ─────────────────────────────────────────────────────────────────────────────
        createRedisClient(options) {
            const redisHost = options.redisServiceHost || 'redis';
            const redisPort = typeof options.redisServicePort === 'string'
                ? parseInt(options.redisServicePort, 10)
                : options.redisServicePort || 6379;
            if (options.useTls) {
                // Check dei path
                if (!options.redisTlsCertPath || !options.redisTlsKeyPath || !options.redisTlsCaPath) {
                    throw new Error('[Orchestrator] TLS is enabled but missing one of: redisTlsCertPath, redisTlsKeyPath, redisTlsCaPath');
                }
                // Leggi i file e crea config TLS
                const tlsConfig = {
                    cert: fs.readFileSync(options.redisTlsCertPath),
                    key: fs.readFileSync(options.redisTlsKeyPath),
                    ca: [fs.readFileSync(options.redisTlsCaPath)],
                    rejectUnauthorized: true,
                };
                return new ioredis_1.default({
                    host: redisHost,
                    port: redisPort,
                    tls: tlsConfig,
                });
            }
            else {
                // No TLS
                return new ioredis_1.default({
                    host: redisHost,
                    port: redisPort,
                });
            }
        }
        // ─────────────────────────────────────────────────────────────────────────────
        //  checkRedisConnection
        // ─────────────────────────────────────────────────────────────────────────────
        async checkRedisConnection(redisClient, maxRetries, retryDelay) {
            let retries = 0;
            while (retries < maxRetries) {
                try {
                    this.log(`[Orchestrator] Attempting to connect to Redis (${retries + 1}/${maxRetries})...`, 'RedisConnection');
                    await redisClient.ping();
                    this.log('[Orchestrator] Redis is ready!', 'RedisConnection');
                    return;
                }
                catch (err) {
                    retries++;
                    console.error(kleur_1.default.red(`[Orchestrator] Redis connection failed, attempt ${retries}/${maxRetries}`));
                    if (retries >= maxRetries) {
                        throw new Error('Redis is unavailable after multiple attempts.');
                    }
                    await new Promise((resolve) => setTimeout(resolve, retryDelay));
                }
            }
        }
        // ─────────────────────────────────────────────────────────────────────────────
        //  Log colorato
        // ─────────────────────────────────────────────────────────────────────────────
        log(message, context, duration = '+0ms') {
            const customHex = (hexColor) => (text) => {
                const r = parseInt(hexColor.slice(1, 3), 16);
                const g = parseInt(hexColor.slice(3, 5), 16);
                const b = parseInt(hexColor.slice(5, 7), 16);
                return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
            };
            const timestamp = (0, dayjs_1.default)().format('MM/DD/YYYY, h:mm:ss A');
            const formattedMessage = kleur_1.default.green(message);
            const hexColor = customHex('#049b84');
            console.log(hexColor(`[Orchestrator] - `) +
                `${timestamp}     ` +
                hexColor(`LOG `) +
                kleur_1.default.yellow(`[${context}] `) +
                formattedMessage +
                kleur_1.default.yellow(` ${duration}`));
        }
    };
    __setFunctionName(_classThis, "MicroservicesOrchestratorService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        MicroservicesOrchestratorService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
    })();
    _classThis.READY_KEY_PREFIX = 'service_ready:';
    _classThis.READY_CHANNEL = 'service_ready';
    (() => {
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return MicroservicesOrchestratorService = _classThis;
})();
exports.MicroservicesOrchestratorService = MicroservicesOrchestratorService;
