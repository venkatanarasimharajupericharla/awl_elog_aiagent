sap.ui.define([
	"sap/m/VBox",
	"sap/m/HBox",
	"sap/m/Image",
	"sap/m/Title",
	"sap/m/Text",
	"sap/m/Label",
	"sap/m/Input",
	"sap/m/DatePicker",
	"sap/m/TimePicker",
	"sap/m/TextArea",
	"sap/m/Select",
	"sap/m/Button",
	"sap/m/Table",
	"sap/m/Column",
	"sap/m/ColumnListItem",
	"sap/m/List",
	"sap/m/ObjectListItem",
	"sap/m/ObjectAttribute",
	"sap/m/Panel",
	"sap/m/Toolbar",
	"sap/m/ToolbarSpacer",
	"sap/m/MessageStrip",
	"sap/m/MessageToast",
	"sap/ui/core/Item",
	"sap/ui/core/Title",
	"sap/ui/layout/form/SimpleForm",
	"sap/ui/model/json/JSONModel"
], function (VBox, HBox, Image, MTitle, Text, Label, Input, DatePicker, TimePicker, TextArea,
	Select, Button, Table, Column, ColumnListItem, List, ObjectListItem, ObjectAttribute, Panel,
	Toolbar, ToolbarSpacer, MessageStrip, MessageToast, Item, CoreTitle, SimpleForm, JSONModel) {
	"use strict";

	function toast(m) { try { MessageToast.show(m); } catch (e) { /* dock quirk */ } }

	function plantOf(catalog, id) { return (catalog.plants || []).filter(function (p) { return p.id === id; })[0] || {}; }

	function fieldControl(type, options, bind) {
		switch (type) {
			case "number": return new Input({ value: "{" + bind + "}", type: "Number", width: "100%" });
			case "date": return new DatePicker({ value: "{" + bind + "}", valueFormat: "yyyy-MM-dd", displayFormat: "medium", width: "100%" });
			case "time": return new TimePicker({ value: "{" + bind + "}", valueFormat: "HH:mm", displayFormat: "HH:mm", width: "100%" });
			case "textarea": return new TextArea({ value: "{" + bind + "}", width: "100%", rows: 2 });
			case "select":
				var s = new Select({ selectedKey: "{" + bind + "}", forceSelection: false, width: "100%" });
				(options || []).forEach(function (o) { s.addItem(new Item({ key: o, text: o })); });
				return s;
			default: return new Input({ value: "{" + bind + "}", width: "100%" });
		}
	}
	function ctrlValue(ctrl) { return ctrl.isA("sap.m.Select") ? ctrl.getSelectedKey() : (ctrl.getValue ? ctrl.getValue() : ""); }
	function fieldError(f, v) {
		var s = v == null ? "" : String(v).trim();
		if (f.required && !s) { return (f.label || f.k) + " is required."; }
		if (s && f.type === "number" && isNaN(Number(s))) { return (f.label || f.k) + " must be a number."; }
		if (s && f.validation) { try { if (!new RegExp(f.validation).test(s)) { return (f.label || f.k) + " is invalid."; } } catch (e) { /* bad regex */ } }
		return null;
	}
	function newDraft(cols) { var r = {}; cols.forEach(function (c) { r[c.k] = c.value || ""; }); return r; }

	// ---- document header ----------------------------------------------------
	function docHeader(def, catalog) {
		var plant = plantOf(catalog, def.plantId);
		var co = (plant.name || "AWL Agri Business Limited") + (def.section ? " — " + def.section : "");
		var oWrap = new VBox({ items: [
			new Text({ text: co }).addStyleClass("awlCoLine"),
			new MTitle({ text: def.name + (def.titleBox ? "  ·  " + def.titleBox : ""), level: "H4" }).addStyleClass("awlFormTitle")
		] }).addStyleClass("awlDocTitleWrap");
		if (def.subtitle) { oWrap.addItem(new Text({ text: def.subtitle }).addStyleClass("awlSubLine")); }
		return new HBox({
			justifyContent: "SpaceBetween", alignItems: "Center",
			items: [
				new HBox({ alignItems: "Center", items: [
					new Image({ src: "img/awl-logo.svg", densityAware: false }).addStyleClass("awlDocLogoImg"), oWrap
				] }),
				new Text({ text: "Document No. - " + def.documentNo }).addStyleClass("awlDocNoLine")
			]
		}).addStyleClass("awlDocHeadUi");
	}

	// ---- sectioned header form ---------------------------------------------
	function headerForm(def, refs) {
		var oForm = new SimpleForm({
			editable: true, layout: "ResponsiveGridLayout",
			labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4, labelSpanS: 12, columnsXL: 2, columnsL: 2, columnsM: 1
		}).addStyleClass("awlHeaderForm");
		var last = null;
		def.headerFields.forEach(function (f) {
			var sec = f.section || "Details";
			if (sec !== last) { oForm.addContent(new CoreTitle({ text: sec })); last = sec; }
			var oCtrl = fieldControl(f.type, f.options, "d>/header/" + f.key);
			refs.header.push({ field: f, ctrl: oCtrl });
			oForm.addContent(new Label({ text: f.label + (f.required ? " *" : "") }));
			oForm.addContent(oCtrl);
		});
		return oForm;
	}

	// ---- entries: vertical add-form + list view ----------------------------
	function entriesSection(def, model, api) {
		var cols = def.grid.columns;

		// vertical "add entry" form
		var draftForm = new SimpleForm({
			editable: true, layout: "ResponsiveGridLayout",
			labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4, labelSpanS: 12, columnsXL: 1, columnsL: 1, columnsM: 1
		}).addStyleClass("awlDraftForm");
		var draftRefs = [];
		cols.forEach(function (c) {
			var oCtrl = fieldControl(c.type, c.options, "d>/draft/" + c.k);
			draftRefs.push({ col: c, ctrl: oCtrl });
			draftForm.addContent(new Label({ text: (c.label || c.k) + (c.required ? " *" : "") }));
			draftForm.addContent(oCtrl);
		});

		var oAdd = new Button({
			text: "Add row", type: "Emphasized", icon: "sap-icon://add",
			press: function () {
				var err = null;
				draftRefs.forEach(function (d) {
					var e = fieldError(d.col, ctrlValue(d.ctrl));
					if (d.ctrl.setValueState) { d.ctrl.setValueState(e ? "Error" : "None"); if (e) { d.ctrl.setValueStateText(e); } }
					if (e) { err = err || e; }
				});
				if (err) { toast(err); return; }
				var entries = model.getProperty("/entries").slice();
				entries.push(Object.assign({}, model.getProperty("/draft")));
				model.setProperty("/entries", entries);
				model.setProperty("/draft", newDraft(cols));
				toast("Entry added.");
			}
		});
		var oClear = new Button({ text: "Clear", type: "Transparent", press: function () { model.setProperty("/draft", newDraft(cols)); } });

		// list of added entries
		var oItem = new ObjectListItem({
			type: "Navigation",
			title: "{d>" + cols[0].k + "}",
			press: function (e) {
				var ctx = e.getSource().getBindingContext("d");
				api.openEntry(parseInt(ctx.getPath().split("/").pop(), 10));
			}
		});
		cols.slice(1, 4).forEach(function (c) { oItem.addAttribute(new ObjectAttribute({ title: c.label || c.k, text: "{d>" + c.k + "}" })); });

		var oList = new List({
			noDataText: "No entries yet — fill the fields above and press Add row.",
			headerToolbar: new Toolbar({ content: [
				new MTitle({ text: "Added entries", level: "H6" }),
				new ToolbarSpacer(),
				new Text({ text: "{= ${d>/entries}.length } total" }).addStyleClass("awlEntryCount")
			] })
		}).addStyleClass("awlEntryList");
		oList.bindItems({ path: "d>/entries", template: oItem });

		return new Panel({
			headerText: def.entriesTitle || "Entries",
			expandable: false,
			content: [
				new Label({ text: "New entry", design: "Bold" }).addStyleClass("awlDraftLabel"),
				draftForm,
				new HBox({ justifyContent: "End", items: [oClear, oAdd] }).addStyleClass("awlDraftBar"),
				oList
			]
		}).addStyleClass("awlEntriesPanel");
	}

	// ---- entry details / edit ----------------------------------------------
	function buildEntryDetail(def, index) {
		var cols = def.grid.columns;
		var oForm = new SimpleForm({
			editable: true, layout: "ResponsiveGridLayout",
			labelSpanXL: 3, labelSpanL: 3, labelSpanM: 4, labelSpanS: 12, columnsXL: 1, columnsL: 1, columnsM: 1
		}).addStyleClass("awlEntryDetailForm");
		cols.forEach(function (c) {
			oForm.addContent(new Label({ text: (c.label || c.k) + (c.required ? " *" : "") }));
			oForm.addContent(fieldControl(c.type, c.options, "d>/entries/" + index + "/" + c.k));
		});
		return new VBox({ width: "100%", items: [
			new MessageStrip({ text: "Review the entry below. Edit any field, or use Delete in the header.", showIcon: true, type: "Information" }).addStyleClass("awlEntryHint"),
			oForm
		] }).addStyleClass("jouleUi5Form");
	}

	// ---- aside / footer -----------------------------------------------------
	function asideBlocks(def, model) {
		var oWrap = new HBox({ wrap: "Wrap", width: "100%" }).addStyleClass("awlAsideUi");
		def.aside.forEach(function (b, bi) {
			var oBlock = new VBox().addStyleClass("awlAsideBlockUi");
			if (b.width) { oBlock.setWidth(b.width); }
			if (b.type === "note") {
				oBlock.addItem(new Label({ text: b.label, design: "Bold" }));
				oBlock.addItem(new TextArea({ value: "{d>/aside/note" + bi + "}", width: "100%", rows: 3, placeholder: b.label }));
			} else {
				var oMini = new Table({ inset: false }).addStyleClass("awlMiniTable");
				(b.cols || []).forEach(function (cName) { oMini.addColumn(new Column({ header: new Text({ text: cName }) })); });
				(b.rows || []).forEach(function (row, ri) {
					var cells = row.map(function (val, ci) {
						return ci === 0 ? new Text({ text: val }) : new Input({ value: "{d>/aside/m" + bi + "_" + ri + "_" + ci + "}", width: "100%" });
					});
					oMini.addItem(new ColumnListItem({ cells: cells }));
				});
				if (b.title) { oBlock.addItem(new Label({ text: b.title, design: "Bold" })); }
				oBlock.addItem(oMini);
			}
			oWrap.addItem(oBlock);
		});
		return oWrap;
	}
	function footerForm(def, refs) {
		var oBox = new VBox({ width: "100%" }).addStyleClass("awlFooterUi");
		def.footerFields.forEach(function (f) {
			var oCtrl = fieldControl(f.type, f.options, "d>/footer/" + f.key);
			refs.footer.push({ field: f, ctrl: oCtrl });
			oBox.addItem(new HBox({ alignItems: "Center", items: [
				new Label({ text: f.label + (f.required ? " *" : "") }).addStyleClass("awlFooterLbl"),
				new VBox({ width: "16rem", items: [oCtrl] })
			] }));
		});
		return oBox;
	}

	return {
		buildEntryDetail: buildEntryDetail,

		/**
		 * @returns {{content: sap.m.VBox, model: sap.ui.model.json.JSONModel}}
		 */
		render: function (def, catalog, api) {
			var cols = (def.grid && def.grid.columns) || [];
			var seed = [];
			if (def.grid && def.grid.rows && def.grid.rows.mode === "seed") {
				(def.grid.rows.seed || []).forEach(function (s) { seed.push(Object.assign(newDraft(cols), s)); });
			}
			var model = new JSONModel({ header: {}, footer: {}, aside: {}, entries: seed, draft: newDraft(cols) });
			(def.headerFields || []).forEach(function (f) { model.setProperty("/header/" + f.key, f.value || ""); });
			(def.footerFields || []).forEach(function (f) { model.setProperty("/footer/" + f.key, f.value || ""); });

			var refs = { header: [], footer: [] };
			var oForm = new VBox({ width: "100%" }).addStyleClass("jouleFormWrap jouleUi5Form");
			oForm.setModel(model, "d");

			oForm.addItem(docHeader(def, catalog));
			if (def.frequency) { oForm.addItem(new Text({ text: "Frequency: " + def.frequency }).addStyleClass("awlFreqLine")); }
			if (def.headerFields && def.headerFields.length) { oForm.addItem(headerForm(def, refs)); }
			if (def.grid) { oForm.addItem(entriesSection(def, model, api)); }
			if (def.aside && def.aside.length) { oForm.addItem(asideBlocks(def, model)); }
			if (def.footerFields && def.footerFields.length) { oForm.addItem(footerForm(def, refs)); }
			if (def.signature) { oForm.addItem(new Text({ text: def.signature }).addStyleClass("awlSignUi")); }

			var oStrip = new MessageStrip({ visible: false, type: "Error", showIcon: true }).addStyleClass("awlResultStrip");
			var oSubmit = new Button({
				text: "Submit " + def.documentNo, type: "Emphasized", icon: "sap-icon://save",
				press: function () {
					var err = null;
					refs.header.concat(refs.footer).forEach(function (h) {
						var e = fieldError(h.field, ctrlValue(h.ctrl));
						if (h.ctrl.setValueState) { h.ctrl.setValueState(e ? "Error" : "None"); if (e) { h.ctrl.setValueStateText(e); } }
						if (e) { err = err || e; }
					});
					var entries = model.getProperty("/entries") || [];
					if (def.grid && entries.length === 0) { err = err || "Add at least one entry before submitting."; }
					if (err) { oStrip.setText(err).setVisible(true); toast(err); return; }

					var payload = { header: model.getProperty("/header"), entries: entries, aside: model.getProperty("/aside"), footer: model.getProperty("/footer") };
					if (window.console) { window.console.log("[ELog submit]", def.documentNo, def.name, payload); }
					oSubmit.setEnabled(false).setText("Submitted ✓").setIcon("sap-icon://accept");
					if (api && api.submitted) { api.submitted({ name: def.name, docNo: def.documentNo, count: entries.length }); }
				}
			});

			oForm.addItem(oStrip);
			oForm.addItem(new HBox({ justifyContent: "End", width: "100%", items: [oSubmit] }).addStyleClass("awlSubmitBar"));
			return { content: oForm, model: model };
		}
	};
});
