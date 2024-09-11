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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MicroservicesOrchestratorService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = __importDefault(require("ioredis"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let MicroservicesOrchestratorService = class MicroservicesOrchestratorService {
    constructor(configService) {
        this.configService = configService;
    }
    // Funzione per attendere che le dipendenze siano pronte con retry e delay personalizzabili
    async areDependenciesReady(serviceName, options = {}) {
        var _a;
        const MAX_RETRIES = options.retry || 5; // Default a 5 se non viene specificato
        const RETRY_DELAY = options.retryDelays || 3000; // Default a 3000ms se non viene specificato
        const redisClient = new ioredis_1.default({
            host: this.configService.get('REDIS_SERVICE_HOST') || 'redis',
            port: parseInt(this.configService.get('REDIS_SERVICE_PORT') || '6379', 10),
        });
        const redisChannel = 'service_ready';
        const configFilePath = path.resolve(__dirname, '../../../service-dependencies.json'); // Percorso del file di configurazione
        // Carichiamo il file di configurazione
        const serviceDependencies = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
        const dependencies = ((_a = serviceDependencies[serviceName]) === null || _a === void 0 ? void 0 : _a.dependsOn) || [];
        let retries = 0;
        let readyCount = 0;
        const promise = new Promise((resolve) => {
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
            }
            catch (error) {
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
    notifyServiceReady(serviceName) {
        const redisClient = new ioredis_1.default({
            host: this.configService.get('REDIS_SERVICE_HOST') || 'redis',
            port: parseInt(this.configService.get('REDIS_SERVICE_PORT') || '6379', 10),
        });
        const redisChannel = 'service_ready';
        // Notifica che il servizio è pronto
        redisClient.publish(redisChannel, `${serviceName}_ready`);
    }
};
exports.MicroservicesOrchestratorService = MicroservicesOrchestratorService;
exports.MicroservicesOrchestratorService = MicroservicesOrchestratorService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], MicroservicesOrchestratorService);
