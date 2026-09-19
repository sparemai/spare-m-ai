import {Manrope} from 'next/font/google';
import './style.css';

const manrope=Manrope({
 subsets:['latin'],
 display:'swap',
 variable:'--font-manrope'
});

export const metadata={
 title:'SPARE-M',
 description:'Business reliability intelligence'
};

export default function RootLayout({children}){
 return <html lang="en" className={manrope.variable}><body>{children}</body></html>
}
