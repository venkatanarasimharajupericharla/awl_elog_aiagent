sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/json/JSONModel",
	"sap/m/VBox",
	"sap/m/HBox",
	"sap/m/Text",
	"sap/m/FormattedText",
	"sap/m/Button",
	"sap/ui/core/Icon",
	"sap/ui/core/HTML",
	"sap/m/MessageToast",
	"joule/model/JouleEngine",
	"joule/model/FormRenderer",
	"joule/model/ODataService"
], function (Controller, JSONModel, VBox, HBox, Text, FormattedText,
	Button, Icon, HTML, MessageToast, JouleEngine, FormRenderer, ODataService) {
	"use strict";

	return Controller.extend("joule.controller.App", {

		onInit: function () {
			this.getView().setModel(new JSONModel({ draft: "" }));
			this.getView().setModel(new JSONModel({ fields: [] }), "admin");

			fetch(sap.ui.require.toUrl("joule/model/catalog.json"))
				.then(function (r) { return r.json(); })
				.then(function (catalog) {
					this._catalog = catalog;
					JouleEngine.init(catalog);
					this.getView().setModel(new JSONModel(this._buildMeta(catalog)), "meta");
					this._welcome();
					this._focusInput();
					this._initRouting();

					// ── Load forms from CAPM OData (primary source) ──
					this._loadODataForms();
				}.bind(this));
		},

		/**
		 * Fetch forms from CAPM OData V4 service.
		 * On success: replaces catalog.forms, refreshes JouleEngine + meta model.
		 * On failure: keeps static catalog.json forms as fallback.
		 */
		_loadODataForms: function () {
			var that = this;
			ODataService.fetchForms().then(function (aForms) {
				if (aForms && aForms.length > 0) {
					// Replace catalog forms with OData-sourced forms
					that._catalog.forms = aForms;
					JouleEngine.refreshCatalog(aForms);
					that._refreshFormsMeta();
					console.log("[App] Switched to CAPM OData forms (" + aForms.length + " forms loaded)");
				} else if (aForms && aForms.length === 0) {
					// Prevent duplicate seeding during rapid live-reloads
					var seedLock = localStorage.getItem("elog_seed_lock");
					if (seedLock && (Date.now() - parseInt(seedLock, 10)) < 15000) {
						console.log("[App] DB seed already in progress — skipping to prevent duplicates.");
						return;
					}
					localStorage.setItem("elog_seed_lock", Date.now().toString());

					// CAPM DB is empty (no forms yet). Let's seed it from the static catalog.json
					console.log("[App] CAPM OData DB is empty — seeding from catalog.json...");
					ODataService.seedDatabase(that._catalog.forms).then(function () {
						// Re-fetch forms so they get their new OData IDs
						ODataService.fetchForms().then(function (aSeededForms) {
							if (aSeededForms && aSeededForms.length) {
								that._catalog.forms = aSeededForms;
								JouleEngine.refreshCatalog(aSeededForms);
								that._refreshFormsMeta();
								console.log("[App] Switched to seeded CAPM OData forms (" + aSeededForms.length + " forms loaded)");
								// Reload the admin fields if we're currently viewing the admin detail page
								var sAdminHash = (window.location.hash || "");
								if (sAdminHash.indexOf("/admin") >= 0) {
									var currentFormId = that.getView().getModel("admin").getProperty("/formId");
									if (currentFormId) {
										that._loadAdminFields(currentFormId);
									}
								}
							}
						});
					});
				} else {
					console.log("[App] CAPM OData not available — using static catalog.json fallback");
				}
			});
		},

		_deptName: function (id) {
			var d = (this._catalog.departments || []).filter(function (x) { return x.id === id; })[0];
			return d ? d.name : id;
		},

		_plantName: function (id) {
			var p = (this._catalog.plants || []).filter(function (x) { return x.id === id; })[0];
			return p ? p.name : id;
		},

		_formMeta: function (f) {
			var nHeader = (f.headerFields || []).length;
			var nCols = (f.grid && f.grid.columns) ? f.grid.columns.length : 0;
			var nFooter = (f.footerFields || []).length;
			return {
				id: f.id, name: f.name, documentNo: f.documentNo, label: f.name + " · " + f.documentNo,
				plantName: f._plantName || this._plantName(f.plantId),
				deptName: f._departmentName || this._deptName(f.departmentId),
				fieldCount: nHeader + nCols + nFooter,
				_odata_ID: f._odata_ID || null
			};
		},

		_buildMeta: function (catalog) {
			var that = this;
			return {
				currentUserId: catalog.context.userId,
				users: catalog.users.map(function (u) { return { id: u.id, label: u.name + " · " + u.role }; }),
				forms: catalog.forms.map(function (f) { return that._formMeta(f); })
			};
		},

		// ---- routing: agent (default) vs. #/admin --------------------------

		_initRouting: function () {
			var that = this;
			window.addEventListener("hashchange", function () { that._applyHash(); });
			this._applyHash();
		},

		_applyHash: function () {
			var h = (window.location.hash || "").replace(/^#\/?/, "");
			if (/^admin/.test(h)) {
				this._nav().to(this.byId("adminListPage").getId(), "show");
			} else {
				this._nav().to(this.byId("agentPage").getId(), "show");
			}
		},

		// ---- conversation --------------------------------------------------

		_conv: function () { return this.byId("jouleConversation"); },

		_welcome: function () {
			this._addMessage("bot", JouleEngine.welcomeText(), null, null);
			this._renderSpec(JouleEngine.respond("show my logs"));
		},

		onResetChat: function () {
			this._conv().destroyItems();
			this._welcome();
		},

		onUserChange: function () {
			var sId = this.byId("userSelect").getSelectedKey();
			var u = JouleEngine.setUser(sId);
			this.getView().getModel("meta").setProperty("/currentUserId", sId);
			this.onResetChat();
			if (u) { this._toast("Signed in as " + u.name + " (" + this._deptName(u.departmentId) + ")"); }
		},

		onSend: function () {
			var oInput = this.byId("jouleInput");
			var sText = (oInput.getValue() || "").trim();
			if (!sText) { return; }
			oInput.setValue("");
			this.getView().getModel().setProperty("/draft", "");
			this._submit(sText);
		},

		_submit: function (sText) {
			this._addMessage("user", sText, null, null);
			var oTyping = this._addTyping();
			setTimeout(function () {
				oTyping.destroy();
				this._renderSpec(JouleEngine.respond(sText));
			}.bind(this), 500);
		},

		_renderSpec: function (oSpec) {
			// form → navigate to the dedicated form screen
			if (oSpec.form) {
				this._addMessage("bot", oSpec.reply, null, null);
				this._openForm(oSpec.form);
				return;
			}
			// admin → open the admin portal
			if (oSpec.admin) {
				this._addMessage("bot", oSpec.reply, null, null);
				this._openAdmin();
				return;
			}
			var aControls = [];
			if (oSpec.build) { aControls.push(oSpec.build(this._api())); }
			this._addMessage("bot", oSpec.reply, aControls, oSpec.suggestions);
		},

		_api: function () {
			var that = this;
			return {
				note: function (sMsg) { that._addMessage("bot", sMsg, null, null); },
				submit: function (sText) { that._submit(sText); }
			};
		},

		// ---- navigation ----------------------------------------------------

		_nav: function () { return this.byId("rootApp"); },

		onNavHome: function () {
			if ((window.location.hash || "").indexOf("admin") >= 0) {
				window.location.hash = "";   // routes back to the agent app
			} else {
				this._nav().to(this.byId("agentPage").getId(), "slide");
			}
		},

		_toast: function (sMsg) {
			try { MessageToast.show(sMsg); } catch (e) { /* MessageToast dock quirk in some UI5 builds */ }
		},

		_openForm: function (form) {
			var that = this;
			this.byId("formTitleText").setText(form.name);
			this.byId("formDocNoText").setText(form.documentNo);
			var res = FormRenderer.render(form, this._catalog, {
				toast: function (m) { that._toast(m); },
				openEntry: function (i) { that._openEntry(i); },
				submitted: function (info) { that._onFormSubmitted(info); }
			});
			this._session = { def: form, model: res.model };
			var oContent = this.byId("formContent");
			oContent.destroyItems();
			oContent.addItem(res.content);
			this._nav().to(this.byId("formPage").getId(), "slide");
		},

		// entry details / edit / delete
		_openEntry: function (index) {
			if (!this._session) { return; }
			this._entryIndex = index;
			var oContent = this.byId("entryContent");
			oContent.destroyItems();
			oContent.setModel(this._session.model, "d");
			oContent.addItem(FormRenderer.buildEntryDetail(this._session.def, index));
			this.byId("entryTitleText").setText(this._session.def.name + " — Entry " + (index + 1));
			this._nav().to(this.byId("entryPage").getId(), "slide");
		},

		onEntryBack: function () { this._nav().to(this.byId("formPage").getId(), "slide"); },

		onEntryDelete: function () {
			if (!this._session) { return; }
			var aEntries = this._session.model.getProperty("/entries").slice();
			aEntries.splice(this._entryIndex, 1);
			this._session.model.setProperty("/entries", aEntries);
			this._toast("Entry deleted.");
			this._nav().to(this.byId("formPage").getId(), "slide");
		},

		_onFormSubmitted: function (info) {
			this._addMessage("bot",
				"✅ <strong>" + info.name + "</strong> (" + info.docNo + ") submitted — <strong>" + info.count +
				"</strong> entr" + (info.count === 1 ? "y" : "ies") + " recorded to ELog.",
				null, ["Show my logs", "Who am I"]);
			this._toast(info.name + " submitted.");
			this._nav().to(this.byId("agentPage").getId(), "slide");
		},

		// ---- admin portal --------------------------------------------------

		onOpenAdmin: function () { window.location.hash = "/admin"; },

		onAdminFormPress: function (oEvent) {
			var oForm = oEvent.getSource().getBindingContext("meta").getObject();
			this._openAdminDetail(oForm.id);
		},

		_openAdminDetail: function (sFormId) {
			var form = JouleEngine.getForm(sFormId);
			if (!form) { return; }
			this._loadAdminFields(sFormId);
			this.byId("adminDetailTitle").setText(form.name);
			this.byId("adminDetailInfo").setText(
				form.documentNo + "  ·  " +
				(form._plantName || this._plantName(form.plantId)) + "  ·  " +
				(form._departmentName || this._deptName(form.departmentId))
			);
			this._nav().to(this.byId("adminPage").getId(), "slide");
		},

		onAdminBack: function () { this._nav().to(this.byId("adminListPage").getId(), "slide"); },

		onAdminDeleteForm: function () {
			var that = this;
			var sId = this.getView().getModel("admin").getProperty("/formId");
			var form = JouleEngine.getForm(sId);
			var aForms = this._catalog.forms;
			var idx = -1;
			aForms.forEach(function (f, i) { if (f.id === sId) { idx = i; } });
			if (idx < 0) { return; }

			// Get OData ID for CAPM delete
			var odataId = aForms[idx]._odata_ID;

			// Remove from in-memory catalog
			aForms.splice(idx, 1);
			this._refreshFormsMeta();
			this._toast((form ? form.name : "Form") + " deleted.");
			this._nav().to(this.byId("adminListPage").getId(), "slide");

			// Delete from CAPM DB if we have an OData ID
			if (odataId) {
				ODataService.deleteForm(odataId).then(function (ok) {
					if (ok) {
						that._toast("Form deleted from CAPM database.");
					} else {
						that._toast("Warning: form removed locally but CAPM delete failed.");
					}
				});
			}
		},

		_refreshFormsMeta: function () {
			var that = this;
			this.getView().getModel("meta").setProperty("/forms", this._catalog.forms.map(function (f) { return that._formMeta(f); }));
		},

		_loadAdminFields: function (sFormId) {
			var form = JouleEngine.getForm(sFormId);
			if (!form) { return; }
			var fields = [];
			(form.headerFields || []).forEach(function (f) {
				fields.push({ group: "Header", key: f.key, label: f.label, type: f.type || "text",
					required: !!f.required, optionsCsv: (f.options || []).join(", "),
					validation: f.validation || "", section: f.section || "",
					_odata_ID: f._odata_ID || null });
			});
			((form.grid && form.grid.columns) || []).forEach(function (c) {
				fields.push({ group: "Column", key: c.k, label: c.label || c.k, type: c.type || "text",
					required: !!c.required, optionsCsv: (c.options || []).join(", "),
					validation: c.validation || "", section: "",
					_odata_ID: c._odata_ID || null });
			});
			this.getView().getModel("admin").setData({ formId: sFormId, fields: fields });
		},

		onAdminSave: function () {
			var that = this;
			var oData = this.getView().getModel("admin").getData();
			var form = JouleEngine.getForm(oData.formId);
			if (!form) { return; }

			function opts(csv) {
				var a = (csv || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
				return a.length ? a : undefined;
			}

			// Update in-memory catalog (existing logic)
			oData.fields.forEach(function (fld) {
				var target = fld.group === "Header"
					? (form.headerFields || []).filter(function (x) { return x.key === fld.key; })[0]
					: (form.grid.columns || []).filter(function (x) { return x.k === fld.key; })[0];
				if (!target) { return; }
				target.label = fld.label;
				target.type = fld.type;
				target.required = !!fld.required;
				target.validation = fld.validation || undefined;
				target.options = opts(fld.optionsCsv);
				if (fld.group === "Header") { target.section = fld.section || target.section; }
			});

			this._toast("Saving field configuration…");

			// ── Write back to CAPM OData DB ──
			ODataService.batchUpdateFields(oData.fields, form).then(function (allOk) {
				if (allOk) {
					that._toast("✅ Field configuration saved to CAPM database for " + form.name + ".");
				} else {
					that._toast("⚠️ Some fields saved locally but CAPM update had errors. Check console.");
				}
			});
		},

		// ---- voice input ---------------------------------------------------

		onMic: function () {
			var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
			if (!Rec) { MessageToast.show("Voice input isn't supported in this browser — please type."); return; }
			var oMic = this.byId("jouleMic");
			if (this._rec) { this._rec.stop(); return; }
			var that = this;
			var rec = new Rec();
			this._rec = rec;
			rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
			oMic.addStyleClass("jouleMicActive");
			rec.onresult = function (e) { that.byId("jouleInput").setValue(e.results[0][0].transcript); };
			rec.onerror = function () { MessageToast.show("Couldn't capture audio."); };
			rec.onend = function () {
				oMic.removeStyleClass("jouleMicActive");
				that._rec = null;
				if ((that.byId("jouleInput").getValue() || "").trim()) { that.onSend(); }
			};
			rec.start();
		},

		// ---- message rendering ---------------------------------------------

		_addMessage: function (sSender, sText, aControls, aSuggestions) {
			var oInner = new VBox().addStyleClass("jouleBubbleInner");
			var bWide = false;

			if (sText) {
				oInner.addItem(sSender === "user" ? new Text({ text: sText }) : new FormattedText({ htmlText: sText }));
			}
			(aControls || []).forEach(function (oCtrl) {
				if (oCtrl) {
					if (oCtrl.hasStyleClass && (oCtrl.hasStyleClass("jouleFormWrap") || oCtrl.hasStyleClass("jouleLogList"))) { bWide = true; }
					oInner.addItem(oCtrl.addStyleClass("jouleGenBlock"));
				}
			});
			if (aSuggestions && aSuggestions.length) {
				var oChips = new HBox({ wrap: "Wrap" }).addStyleClass("jouleChips");
				aSuggestions.forEach(function (sChip) {
					oChips.addItem(new Button({ text: sChip, press: this._submit.bind(this, sChip) }).addStyleClass("jouleChip"));
				}.bind(this));
				oInner.addItem(oChips);
			}

			var oRow;
			if (sSender === "user") {
				var oBubble = new VBox({ items: [oInner] }).addStyleClass("jouleBubble jouleBubbleUser");
				oRow = new HBox({ justifyContent: "End", items: [oBubble] }).addStyleClass("jouleRow");
			} else {
				var oBot = new VBox({ items: [oInner] }).addStyleClass("jouleBubble jouleBubbleBot" + (bWide ? " jouleBubbleWide" : ""));
				oRow = new HBox({ items: [new Icon({ src: "sap-icon://ai" }).addStyleClass("jouleBotOrb"), oBot] }).addStyleClass("jouleRow");
			}
			this._conv().addItem(oRow);
			this._scrollToBottom();
		},

		_addTyping: function () {
			var oTyping = new HBox({ items: [
				new Icon({ src: "sap-icon://ai" }).addStyleClass("jouleBotOrb"),
				new HTML({ content: "<div class='jouleDots'><span></span><span></span><span></span></div>" })
			] }).addStyleClass("jouleRow jouleTypingRow");
			this._conv().addItem(oTyping);
			this._scrollToBottom();
			return oTyping;
		},

		_scrollToBottom: function () {
			var oScroll = this.byId("jouleScroll");
			if (!oScroll) { return; }
			setTimeout(function () { oScroll.scrollTo(0, 9999999, 300); }, 60);
		},

		_focusInput: function () {
			setTimeout(function () {
				var oInput = this.byId("jouleInput");
				if (oInput) { oInput.focus(); }
			}.bind(this), 300);
		}
	});
});
