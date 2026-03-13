from PIL import Image, ImageOps


def add_padding_to_image(image_path, output_path, target_height):
    # Bild öffnen
    image = Image.open(image_path)

    # Aktuelle Breite und Höhe des Bildes bekommen
    original_width, original_height = image.size

    # Wenn die Zielhöhe kleiner als die aktuelle Höhe ist, machen wir nichts
    if target_height <= original_height:
        print("Die Zielhöhe ist kleiner oder gleich der aktuellen Höhe. Keine Änderungen vorgenommen.")
        image.save(output_path)
        return

    # Berechnen der neuen Höhe und der benötigten weißen Balken
    padding_height = (target_height - original_height) // 2

    # Hinzufügen der weißen Balken
    new_image = ImageOps.expand(image, border=(0, padding_height), fill='white')

    # Wenn die Zielhöhe ungerade ist, müssen wir einen zusätzlichen Pixel unten hinzufügen
    if (target_height - original_height) % 2 != 0:
        new_image = ImageOps.expand(new_image, border=(0, 0, 0, 1), fill='white')

    # Speichern des neuen Bildes
    new_image.save(output_path)
    print(f"Das Bild wurde erfolgreich angepasst und unter {output_path} gespeichert.")


# Beispielnutzung
image_path = 'C:/Users/max.delafuente/Documents/Mein Projekt/public/assets/image-6.png'
output_path = 'C:/Users/max.delafuente/Documents/Mein Projekt/public/assets/image-6.png'
target_height = 600  # Zielhöhe in Pixeln

add_padding_to_image(image_path, output_path, target_height)
