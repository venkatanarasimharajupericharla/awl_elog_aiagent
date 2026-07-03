sap.ui.define([
	"sap/m/VBox",
	"sap/m/HBox",
	"sap/m/Button",
	"sap/m/Title",
	"sap/m/Text",
	"sap/m/Label",
	"sap/m/ObjectStatus",
	"joule/model/FormRenderer"
], function (VBox, HBox, Button, Title, Text, Label, ObjectStatus, FormRenderer) {
	"use strict";

	var _catalog = null;
	var _ctx = { plantId: null, departmentId: null, userId: null };

	// ---- lookups ------------------------------------------------------------
	function byId(list, id) {
		return (list || []).filter(function (x) { return x.id === id; })[0];
	}
	function plant() { return byId(_catalog.plants, _ctx.plantId) || {}; }
	function dept() { return byId(_catalog.departments, _ctx.departmentId) || {}; }
	function user() { return byId(_catalog.users, _ctx.userId) || {}; }
	function deptsOfPlant() {
		return (_catalog.departments || []).filter(function (d) { return d.plantId === _ctx.plantId; });
	}
	function formsForDept(depId) {
		return (_catalog.forms || []).filter(function (f) { return f.departmentId === depId; });
	}

	function findForm(text) {
		var s = text.toLowerCase();
		var best = null, bestScore = 0;
		(_catalog.forms || []).forEach(function (f) {
			var score = 0;
			if (f.documentNo && s.indexOf(f.documentNo.toLowerCase()) !== -1) { score += 5; }
			if (s.indexOf(f.name.toLowerCase()) !== -1) { score += 6; }
			(f.keywords || []).forEach(function (k) { if (s.indexOf(k) !== -1) { score += 2; } });
			f.name.toLowerCase().split(/[^a-z0-9]+/).forEach(function (w) {
				if (w.length > 3 && s.indexOf(w) !== -1) { score += 1; }
			});
			if (score > bestScore) { bestScore = score; best = f; }
		});
		return bestScore >= 2 ? best : null;
	}

	function findDept(text) {
		var s = text.toLowerCase();
		return deptsOfPlant().filter(function (d) {
			return s.indexOf(d.name.toLowerCase()) !== -1 ||
				(d.id === "maint" && /maintenance/.test(s)) ||
				(d.id === "wfp" && /(packing|flour)/.test(s));
		})[0];
	}

	// ---- builders -----------------------------------------------------------
	function kpiRow(label, valueCtrl) {
		return new HBox({ justifyContent: "SpaceBetween", items: [new Label({ text: label }), valueCtrl] })
			.addStyleClass("jouleKpiRow");
	}

	function buildContextCard() {
		return new VBox({
			width: "100%",
			items: [
				kpiRow("Plant", new Text({ text: plant().name })),
				kpiRow("Department", new ObjectStatus({ text: dept().name, state: "Success", inverted: true })),
				kpiRow("User", new Text({ text: user().name })),
				kpiRow("Role", new Text({ text: user().role }))
			]
		}).addStyleClass("jouleCtxCard");
	}

	function buildLogList(depId, api) {
		var forms = formsForDept(depId);
		var oBox = new VBox({ width: "100%" }).addStyleClass("jouleLogList");
		forms.forEach(function (f) {
			oBox.addItem(new Button({
				text: f.name + "  ·  " + f.documentNo,
				icon: "sap-icon://document-text",
				width: "100%",
				press: function () { api.submit(f.name); }
			}).addStyleClass("jouleLogBtn"));
		});
		return oBox;
	}

	function buildAllLogs(api) {
		var oBox = new VBox({ width: "100%" }).addStyleClass("jouleLogList");
		deptsOfPlant().forEach(function (d) {
			oBox.addItem(new Title({ text: d.name, level: "H6" }).addStyleClass("jouleLogDept"));
			formsForDept(d.id).forEach(function (f) {
				oBox.addItem(new Button({
					text: f.name + "  ·  " + f.documentNo,
					icon: "sap-icon://document-text",
					width: "100%",
					press: function () { api.submit(f.name); }
				}).addStyleClass("jouleLogBtn"));
			});
		});
		return oBox;
	}

	// ---- main routing -------------------------------------------------------
	return {
		init: function (catalog) {
			_catalog = catalog;
			_ctx = {
				plantId: catalog.context.plantId,
				departmentId: catalog.context.departmentId,
				userId: catalog.context.userId
			};
		},

		setUser: function (userId) {
			var u = byId(_catalog.users, userId);
			if (u) { _ctx = { plantId: u.plantId, departmentId: u.departmentId, userId: u.id }; }
			return u;
		},

		context: function () { return { plant: plant(), dept: dept(), user: user() }; },
		getForm: function (id) { return byId(_catalog.forms, id); },
		allForms: function () { return _catalog.forms || []; },

		welcomeText: function () {
			return "Hi " + user().name + " 👋 I'm the <strong>AWL ELog AI Agent</strong> for <strong>" + plant().name +
				"</strong>.<br>You're in <strong>" + dept().name + "</strong>. Tell me a log to open — I'll render the form for you to fill.";
		},

		welcomeSuggestions: function () {
			var forms = formsForDept(_ctx.departmentId).slice(0, 3).map(function (f) { return f.name; });
			return ["Show my logs"].concat(forms).concat(["Who am I"]);
		},

		respond: function (sPrompt) {
			var s = (sPrompt || "").trim();
			var low = s.toLowerCase();

			// greeting
			if (/^(hi|hello|hey|hallo|good (morning|afternoon|evening)|start)\b/.test(low)) {
				return { reply: this.welcomeText(), suggestions: this.welcomeSuggestions() };
			}

			// who am I / context
			if (/(who am i|my (info|details|context|profile)|current (plant|department|context)|profile)/.test(low)) {
				return {
					reply: "Here's your current context. Forms are filtered by your plant and department.",
					build: function () { return buildContextCard(); },
					suggestions: ["Show my logs", "Switch department"]
				};
			}

			// switch department
			if (/(switch|change).*(department|dept|plant)|^department\b|^switch\b/.test(low)) {
				var d = findDept(low);
				if (d) {
					_ctx.departmentId = d.id;
					return {
						reply: "Switched to <strong>" + d.name + "</strong>. Here are the logs for this department:",
						suggestions: formsForDept(d.id).map(function (f) { return f.name; })
					};
				}
				return {
					reply: "Which department would you like to switch to?",
					suggestions: deptsOfPlant().map(function (x) { return "Switch to " + x.name; })
				};
			}

			// all logs (every department) — checked before "my logs" so "show all logs" wins
			if (/(all logs|all forms|everything|every log|complete list)/.test(low)) {
				return {
					reply: "All logs across your plant, grouped by department:",
					build: function (api) { return buildAllLogs(api); },
					suggestions: ["Switch department"]
				};
			}

			// list logs (current dept)
			if (/(my logs|show.*logs|list.*(logs|forms)|which (logs|forms)|available (logs|forms)|^logs\b|^forms\b)/.test(low)) {
				return {
					reply: "These are the logs available in <strong>" + dept().name + "</strong>. Pick one to open it:",
					build: function (api) { return buildLogList(_ctx.departmentId, api); },
					suggestions: ["Show all logs", "Switch department"]
				};
			}

			// admin portal
			if (/(admin|configure|field config|configuration|manage fields|settings)/.test(low)) {
				return { admin: true, reply: "Opening the admin portal to configure form fields…" };
			}

			// help
			if (/(help|what can you do|capabilities|how do)/.test(low)) {
				return {
					reply: "I render AWL production logs on demand:<br>" +
						"• <strong>Show my logs</strong> — forms for your department<br>" +
						"• Name a log (e.g. <em>Magnet Cleaning Check List</em> or <em>AB/P/02</em>) — I render the fillable form<br>" +
						"• <strong>Full screen</strong> on any form for the print view<br>" +
						"• <strong>Switch department</strong> to see other logs",
					suggestions: this.welcomeSuggestions()
				};
			}

			// a specific form → navigate to the form screen
			var form = findForm(low);
			if (form) {
				return {
					reply: "Opening <strong>" + form.name + "</strong> (" + form.documentNo + ")…",
					form: form
				};
			}

			if (/(thank|thanks|cheers|great|nice|ok|cool)/.test(low)) {
				return { reply: "Happy to help! Want another log?", suggestions: ["Show my logs"] };
			}

			// fallback
			return {
				reply: "I couldn't match that to a log. Try <strong>Show my logs</strong>, name a form, or a document number like <em>AB/P/11</em>.",
				suggestions: this.welcomeSuggestions()
			};
		}
	};
});
