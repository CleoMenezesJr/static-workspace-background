UUID := static-workspace-background@CleoMenezesJr.github.io
SRC := extension.js metadata.json
DEST := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: install uninstall

install:
	@mkdir -p "$(DEST)"
	@cp -f $(SRC) "$(DEST)"
	@echo "Installed: $(DEST)"

uninstall:
	@rm -rf "$(DEST)"