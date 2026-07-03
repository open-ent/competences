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
import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.events.EventStore;
import org.entcore.common.user.UserInfos;
import org.entcore.common.user.UserUtils;
import io.vertx.core.Handler;
import io.vertx.core.http.HttpServerRequest;


public class CompetencesController extends ControllerHelper {

    private EventStore eventStore;
    public CompetencesController() {}
    public CompetencesController(EventStore eventStore){
        this.eventStore = eventStore;
    }

	/**
	 * Displays the home view.
	 * @param request Client request
	 */
	@Get("")
	@SecuredAction("competences.access")
	public void view(final HttpServerRequest request) {
        UserUtils.getUserInfos(eb, request, new Handler<UserInfos>() {
            @Override
            public void handle(UserInfos user) {
                Utils.setLocale(I18n.acceptLanguage(request));
                Utils.setDomain(getHost(request));
                final String type = user.getType();
                // CCTP 51C — React PAR DÉFAUT : l'IHM AngularJS ne rend aucun contenu pour l'enseignant
                // (page vide). Le fallback Java est "react" (conf `frontend-ui` strippée par le springboard) ;
                // repli AngularJS via `?ui=angular`.
                final String uiParam = request.params().get("ui");
                final String frontendUi = "angular".equals(config.getString("frontend-ui", "react")) ? "angular" : "react";
                final String ui = ("react".equals(uiParam) || "angular".equals(uiParam)) ? uiParam : frontendUi;
                if ("react".equals(ui)) {
                    renderView(request, null, "eval_react.html", null);
                } else if("Student".equals(type) || "Relative".equals(type)){
                    renderView(request, null,  "eval_parents.html", null);
                } else {
                    // Teacher/Personnel + cas type null (ex. admin) : vue enseignant par défaut
                    // (évite le NullPointerException sur getType() et la page blanche)
                    renderView(request, null, "eval_teacher.html", null);
                }
                eventStore.createAndStoreEvent(EventStoresCompetences.ACCESS.toString(), request);
            }
        });
	}
}
