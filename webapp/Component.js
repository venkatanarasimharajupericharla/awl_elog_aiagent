sap.ui.define([
	"sap/ui/core/UIComponent",
	"sap/ui/Device"
], function (UIComponent, Device) {
	"use strict";

	return UIComponent.extend("joule.Component", {

		metadata: {
			manifest: "json"
		},

		init: function () {
			// call the base component's init function
			UIComponent.prototype.init.apply(this, arguments);

			// expose a device model so views can react to phone / tablet / desktop
			this.setModel(new sap.ui.model.json.JSONModel({
				isPhone: Device.system.phone,
				isTablet: Device.system.tablet,
				isDesktop: Device.system.desktop,
				isTouch: Device.support.touch
			}), "device");

			// apply responsive CSS classes to the body based on device type
			var sClass = Device.system.phone ? "sapUiDevPhone" :
				Device.system.tablet ? "sapUiDevTablet" : "sapUiDevDesktop";
			document.body.classList.add(sClass);
		}
	});
});
