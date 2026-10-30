frappe.ui.form.on("FND BOQ", {
    refresh(frm) {
        console.log('refresh form FND BOQ');

        // Main button to trigger Snackbar alert
        frm.add_custom_button(__('Show Snackbar'), function () {
            Snackbar.success(__('FND BOQ details loaded successfully!'), {
                position: 'bottom-left',
                action: {
                    text: __('Undo'),
                    onClick: (toast) => {
                        toast.dismiss();
                        Snackbar.info(__('Action undone.'));
                    }
                }
            });
        });
    }
});
