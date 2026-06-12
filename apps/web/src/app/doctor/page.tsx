import { redirect } from "next/navigation";

export default function DoctorHomePage() {
  redirect("/doctor/reviews");
}
