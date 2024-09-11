import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MicroservicesOrchestratorService } from './microservices-orchestrator.service';

@Module({
    imports: [ConfigModule.forRoot({
        isGlobal: true, // Configura ConfigModule come globale
    })],
    providers: [MicroservicesOrchestratorService],
    exports: [MicroservicesOrchestratorService], // Esporta il servizio per l'uso in altri moduli
})
export class MicroservicesOrchestratorModule {}
