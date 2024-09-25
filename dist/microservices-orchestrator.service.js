"use strict";
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
// Forza kleur ad abilitare i colori
kleur_1.default.enabled = true;
let MicroservicesOrchestratorService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var MicroservicesOrchestratorService = _classThis = class {
        constructor() { }
        // Funzione per verificare la prontezza delle dipendenze
        async areDependenciesReady(serviceName, options = {}) {
            this.log(`[Orchestrator] Inizio controllo delle dipendenze per il servizio: ${serviceName}`, 'DependencyChecker');
            const MAX_RETRIES = options.retry || 5;
            const RETRY_DELAY = options.retryDelays || 3000;
            // Crea il client Redis
            const redisClient = new ioredis_1.default({
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
            const resolvedDependencies = new Set();
            let readyCount = 0;
            // Sottoscrivi al canale Redis per ascoltare quando le dipendenze sono pronte
            const redisChannel = 'service_ready';
            redisClient.subscribe(redisChannel, (err) => {
                if (err) {
                    console.error(kleur_1.default.red('[Orchestrator] Errore nella sottoscrizione al canale Redis:'), err);
                }
                else {
                    this.log(`[Orchestrator] Sottoscritto al canale ${redisChannel}`, 'RedisConnection');
                }
            });
            return new Promise((resolve, reject) => {
                // Timeout per evitare blocchi infiniti
                const timeout = setTimeout(() => {
                    reject(new Error(`Timeout: non tutte le dipendenze sono pronte dopo ${MAX_RETRIES * RETRY_DELAY} ms.`));
                }, MAX_RETRIES * RETRY_DELAY);
                // Ascolta i messaggi da Redis
                redisClient.on('message', (channel, message) => {
                    dependencies.forEach((dependency) => {
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
        notifyServiceReady(serviceName, options = {}) {
            const redisClient = new ioredis_1.default({
                host: options.redisServiceHost || 'redis',
                port: typeof options.redisServicePort === 'string' ? parseInt(options.redisServicePort, 10) : options.redisServicePort || 6379,
            });
            const redisChannel = 'service_ready';
            this.log(`[Orchestrator] Notifica che il servizio ${serviceName} è pronto...`, 'RedisNotification');
            redisClient.publish(redisChannel, `${serviceName}_ready`, (err, reply) => {
                if (err) {
                    console.error(kleur_1.default.red(`[Orchestrator] Errore durante la pubblicazione del messaggio su Redis: ${err.message}`));
                }
                else {
                    this.log(`[Orchestrator] Messaggio pubblicato con successo su Redis. Risposta: ${reply}`, 'RedisNotification');
                }
                redisClient.quit();
            });
        }
        // Funzione per controllare la connessione a Redis
        async checkRedisConnection(redisClient, maxRetries, retryDelay) {
            let retries = 0;
            while (retries < maxRetries) {
                try {
                    this.log(`[Orchestrator] Tentativo di connessione a Redis (${retries + 1}/${maxRetries})...`, 'RedisConnection');
                    await redisClient.ping();
                    this.log('[Orchestrator] Redis è pronto!', 'RedisConnection');
                    return;
                }
                catch (err) {
                    retries++;
                    console.error(kleur_1.default.red(`[Orchestrator] Connessione a Redis fallita, tentativo ${retries}/${maxRetries}`));
                    if (retries >= maxRetries) {
                        throw new Error('Redis non è disponibile dopo vari tentativi.');
                    }
                    await new Promise((resolve) => setTimeout(resolve, retryDelay));
                }
            }
        }
        // Funzione di log colorata
        log(message, context, duration = '+0ms') {
            const customHex = (hexColor) => (text) => {
                const r = parseInt(hexColor.slice(1, 3), 16);
                const g = parseInt(hexColor.slice(3, 5), 16);
                const b = parseInt(hexColor.slice(5, 7), 16);
                return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
            };
            const timestamp = (0, dayjs_1.default)().format('MM/DD/YYYY, h:mm:ss A');
            const formattedMessage = kleur_1.default.green(message); // Usa il colore verde predefinito
            const hexColor = customHex('#049b84'); // Definisci il colore esadecimale personalizzato
            console.log(hexColor(`[Orchestrator] 29 - `) +
                `${timestamp}     ` +
                hexColor(`LOG `) + // Usa il colore esadecimale personalizzato
                kleur_1.default.yellow(`[${context}] `) + // Context in giallo
                formattedMessage + // Messaggio formattato in verde
                kleur_1.default.yellow(` ${duration}`) // Durata in giallo
            );
        }
    };
    __setFunctionName(_classThis, "MicroservicesOrchestratorService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        MicroservicesOrchestratorService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return MicroservicesOrchestratorService = _classThis;
})();
exports.MicroservicesOrchestratorService = MicroservicesOrchestratorService;
