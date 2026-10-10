/*
 * Copyright (c) Région Hauts-de-France, Département de la Seine-et-Marne, CGI, 2016.
 *     This file is part of OPEN ENT NG. OPEN ENT NG is a versatile ENT Project based on the JVM and ENT Core Project.
 *
 *   This program is free software; you can redistribute it and/or modify
 *   it under the terms of the GNU Affero General Public License as
 *   published by the Free Software Foundation (version 3 of the License).
 *   For the sake of explanation, any module that communicate over native
 *   Web protocols, such as HTTP, with OPEN ENT NG is outside the scope of this
 *   license and could be license under its own terms. This is merely considered
 *   normal use of OPEN ENT NG, and does not fall under the heading of "covered work".
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

package fr.openent.competences.controllers;

import fr.openent.competences.Competences;
import fr.openent.competences.Utils;
import fr.openent.competences.enums.EventStoresCompetences;
import fr.wseduc.rs.Get;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.I18n;
import io.vertx.core.Future;
import io.vertx.core.Promise;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.events.EventStore;
import org.entcore.common.neo4j.Neo4j;
import org.entcore.common.user.UserUtils;
import org.vertx.java.core.http.RouteMatcher;

import java.util.Map;


public class CompetencesController extends ControllerHelper {

    /** Clé de préférence usager portant le choix d'IHM, et l'état des bandeaux qui le proposent.
     *  ⚠ Ni tiret ni point : entcore retire les caractères non alphanumériques d'une clé de
     *  préférence avant d'en faire un nom de propriété Cypher. */
    private static final String UI_PREFERENCE = "competencesUi";

    /** IHM servie quand l'usager n'a rien choisi : "react" (nouvelle) ou "angular" (ancienne),
     *  pilotée par la conf `frontend-ui` du bloc du module dans ent-core.yaml, elle-même alimentée
     *  par la variable COMPETENCES_FRONTEND_UI — PROPRE à ce module, isolée de FRONTEND_UI_DEFAULT
     *  que partagent plusieurs modules. Le repli Java ne joue que si la conf est absente. */
    private String frontendUi = "angular";

    private final Neo4j neo4j = Neo4j.getInstance();
    private EventStore eventStore;
    public CompetencesController() {}
    public CompetencesController(EventStore eventStore){
        this.eventStore = eventStore;
    }

    @Override
    public void init(Vertx vertx, JsonObject config, RouteMatcher rm,
                     Map<String, fr.wseduc.webutils.security.SecuredAction> securedActions) {
        super.init(vertx, config, rm, securedActions);
        this.frontendUi = "react".equals(config.getString("frontend-ui", "angular")) ? "react" : "angular";
    }

	/**
	 * Displays the home view.
	 * @param request Client request
	 */
	@Get("")
	@SecuredAction("competences.access")
	public void view(final HttpServerRequest request) {
        // Choix de l'IHM (migration React), par ordre de priorité décroissante :
        //   1. `?ui=react|angular` — dérogation ponctuelle, NON mémorisée (vérification, support) ;
        //   2. la préférence de l'usager (clé `competencesUi`), posée par les bandeaux de bascule et
        //      par la page de réglages du dashboard ;
        //   3. la conf `frontend-ui` de la plateforme.
        // Les mêmes règles valent pour tous : l'espace des élèves et des parents est porté lui
        // aussi, l'interface React choisissant ses écrans d'après le profil de la session.
        final String uiParam = request.params().get("ui");
        final String forcedUi = ("react".equals(uiParam) || "angular".equals(uiParam)) ? uiParam : null;

        UserUtils.getUserInfos(eb, request, user -> {
            if (user == null) {
                unauthorized(request);
                return;
            }
            Utils.setLocale(I18n.acceptLanguage(request));
            Utils.setDomain(getHost(request));
            final String type = user.getType();
            final boolean studentOrRelative = "Student".equals(type) || "Relative".equals(type);
            final Future<String> ui = preferredUi(user.getUserId(), forcedUi);
            ui.onSuccess(chosen -> {
                if ("react".equals(chosen)) {
                    // Vue GÉNÉRÉE par Vite (frontend/index.html) : ses fichiers portent une
                    // empreinte de contenu dont seul le build connaît les noms.
                    renderView(request, new JsonObject(), "competences-react.html", null);
                } else if (studentOrRelative) {
                    renderView(request, null, "eval_parents.html", null);
                } else {
                    // Teacher/Personnel + cas type null (ex. admin) : vue enseignant par défaut
                    // (évite le NullPointerException sur getType() et la page blanche)
                    renderView(request, null, "eval_teacher.html", null);
                }
                eventStore.createAndStoreEvent(EventStoresCompetences.ACCESS.toString(), request);
            });
        });
	}

    /**
     * IHM à servir : la dérogation d'URL si elle est présente, sinon le choix mémorisé par
     * l'usager, sinon celui de la plateforme.
     *
     * Le choix est lu à SA SOURCE, le nœud {@code UserAppConf} du graphe, et non via la session ni
     * via le bus {@code userbook.preferences} : ni l'un ni l'autre ne restitue une clé écrite
     * pendant la session en cours. C'est ce même nœud qu'écrit {@code PUT /userbook/preference/:app}.
     *
     * Aucune panne de cette lecture ne doit empêcher le module de s'afficher : à la moindre
     * difficulté, la plateforme tranche.
     */
    private Future<String> preferredUi(String userId, String forcedUi) {
        if (forcedUi != null) return Future.succeededFuture(forcedUi);

        final Promise<String> promise = Promise.promise();
        final String query = "MATCH (:User {id:{userId}})-[:PREFERS]->(uac:UserAppConf) " +
                "RETURN uac." + UI_PREFERENCE + " AS preference";
        neo4j.execute(query, new JsonObject().put("userId", userId), message -> {
            promise.complete(readUi(message.body()));
        });
        return promise.future();
    }

    /** Extrait le choix d'IHM du résultat Neo4j — la préférence y est rangée en CHAÎNE JSON. */
    private String readUi(JsonObject body) {
        try {
            final JsonArray rows = body.getJsonArray("result", new JsonArray());
            if (rows.isEmpty()) return frontendUi;
            final String raw = rows.getJsonObject(0).getString("preference");
            if (raw == null || raw.trim().isEmpty()) return frontendUi;
            final String ui = new JsonObject(raw).getString("ui");
            return ("react".equals(ui) || "angular".equals(ui)) ? ui : frontendUi;
        } catch (Exception e) {
            // Préférence illisible ou graphe en échec : la plateforme tranche. Jamais d'erreur 500
            // pour un choix d'habillage.
            log.warn("[Competences@readUi] préférence " + UI_PREFERENCE + " illisible", e);
            return frontendUi;
        }
    }
}
