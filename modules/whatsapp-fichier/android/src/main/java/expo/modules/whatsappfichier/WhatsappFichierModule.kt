package expo.modules.whatsappfichier

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

internal class WhatsAppAbsentException : CodedException("WhatsApp n'est pas installé sur ce téléphone.")
internal class FichierIntrouvableException(chemin: String) : CodedException("Fichier introuvable : $chemin")

// Ouvre WhatsApp directement sur la conversation d'un numéro, avec un fichier joint (le PDF) et une légende déjà
// écrite : il ne reste qu'à appuyer sur la flèche. Le fichier doit être dans le cache de l'appli, que partage le
// fournisseur de fichiers d'expo-sharing (« <appli>.SharingFileProvider »).
class WhatsappFichierModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.AppContextLost()

  private fun paquetWhatsApp(): String? =
    listOf("com.whatsapp", "com.whatsapp.w4b").firstOrNull { paquet ->
      try {
        context.packageManager.getPackageInfo(paquet, 0)
        true
      } catch (e: PackageManager.NameNotFoundException) {
        false
      }
    }

  override fun definition() = ModuleDefinition {
    Name("WhatsappFichier")

    Function("installe") { paquetWhatsApp() != null }

    // Ouvre la conversation d'un numéro avec un message déjà écrit, sans fichier. L'intention est adressée à WhatsApp
    // lui-même (setPackage) et lancée depuis l'écran de CoachGo, sans FLAG_ACTIVITY_NEW_TASK : Linking.openURL de
    // React Native ajoute ce drapeau pour toute autre appli, et Android se contente alors de ramener WhatsApp tel qu'il
    // était (la dernière conversation ouverte), sans le numéro ni le message ; un lien wa.me peut aussi partir au navigateur.
    AsyncFunction("ouvrirConversation") { telephone: String, message: String ->
      val paquet = paquetWhatsApp() ?: throw WhatsAppAbsentException()
      val chiffres = telephone.filter { it.isDigit() }
      val lien = Uri.parse("https://api.whatsapp.com/send").buildUpon()
        .apply { if (chiffres.isNotEmpty()) appendQueryParameter("phone", chiffres) }
        .appendQueryParameter("text", message)
        .build()
      val intent = Intent(Intent.ACTION_VIEW, lien).apply { setPackage(paquet) }
      val activite = appContext.currentActivity
      if (activite != null) {
        activite.startActivity(intent)
      } else {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }

    AsyncFunction("envoyer") { fichier: String, telephone: String, message: String, typeFichier: String ->
      val paquet = paquetWhatsApp() ?: throw WhatsAppAbsentException()
      val chemin = Uri.parse(fichier).path ?: fichier
      val f = File(chemin)
      if (!f.exists()) throw FichierIntrouvableException(chemin)
      val uri = FileProvider.getUriForFile(context, "${context.packageName}.SharingFileProvider", f)
      val chiffres = telephone.filter { it.isDigit() }
      val intent = Intent(Intent.ACTION_SEND).apply {
        type = typeFichier
        setPackage(paquet)
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_TEXT, message)
        // Le destinataire : la conversation s'ouvre sur ce numéro au lieu de la liste des contacts.
        if (chiffres.isNotEmpty()) putExtra("jid", "$chiffres@s.whatsapp.net")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      context.grantUriPermission(paquet, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
      val activite = appContext.currentActivity
      if (activite != null) {
        activite.startActivity(intent)
      } else {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }
  }
}
