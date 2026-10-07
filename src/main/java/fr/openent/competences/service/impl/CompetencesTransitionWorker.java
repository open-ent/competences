package fr.openent.competences.service.impl;

import fr.openent.competences.constants.Field;
import fr.openent.competences.model.Config;
import fr.openent.competences.service.TransitionService;
import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.eventbus.Message;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;
import org.entcore.common.sql.Sql;
import org.vertx.java.busmods.BusModBase;

import java.util.ArrayList;
import java.util.List;

public class CompetencesTransitionWorker extends BusModBase implements Handler<Message<JsonObject>> {
    private static final Logger log = LoggerFactory.getLogger(CompetencesTransitionWorker.class);
    private boolean isWorking = false;
    List<JsonObject> structures = new ArrayList<>();
    private TransitionService transitionService;
    @Override
    public void start() {
        log.info("[CompetencesTransitionWorker] start() called");
        try {
            super.start();
            log.info("[CompetencesTransitionWorker] super.start() done");
            Config configuration = new Config(config);
            log.info("[CompetencesTransitionWorker] Config created");
            Sql sqlAdmin = Sql.createInstance(vertx.eventBus(), configuration.sqlAdminAdress());
            log.info("[CompetencesTransitionWorker] Sql created");
            this.transitionService = new DefaultTransitionService(sqlAdmin);
            log.info("[CompetencesTransitionWorker] TransitionService created");
            vertx.eventBus().localConsumer(CompetencesTransitionWorker.class.getSimpleName(), this);
            log.info("[CompetencesTransitionWorker] start() completed successfully");
        } catch (Throwable t) {
            log.error("[CompetencesTransitionWorker] start() FAILED with: " + t.getMessage(), t);
            throw t;
        }
    }

    @Override
    public void handle(Message<JsonObject> eventMessage) {
        log.info("["+ this.getClass().getSimpleName()+"] receiving");

        eventMessage.reply(new JsonObject().put("status", "ok"));

        stackStructure(eventMessage.body().getJsonObject("structure"));
        if(!isWorking){
            isWorking = true;
            new Thread(() -> {
                processTransitionRepositery(StructureHandlerWork());
            }).start();
        }
    }

    private void stackStructure(JsonObject structure) {
        structures.add(structure);
    }

    private JsonObject HandleStackJsonObject() {
        if(structures.size() != 0) {
            JsonObject structure = structures.get(0);
            structures.remove(0);
            return structure;
        } else {
            log.info("end work");
            isWorking = false;
            return null;
        }
    }

    private void processTransitionRepositery(Handler<Either<String, Boolean>> structureHandlerWork) {
        JsonObject structureToHandle = HandleStackJsonObject();
        if (structureToHandle == null) return;
        log.info("start Work ");
        transitionService.transitionAnneeStructure(structureToHandle, new Handler<Either<String, JsonArray>>() {
            @Override
            public void handle(Either<String, JsonArray> event) {
                log.info("fin struct ");
                processTransitionRepositery(StructureHandlerWork());
            }
        });
    }

    private Handler<Either<String, Boolean>> StructureHandlerWork() {
        return new Handler<Either<String, Boolean>>() {
            @Override
            public void handle(Either<String, Boolean> event) {
                log.info("end work for structure");
            }
        };
    }
}